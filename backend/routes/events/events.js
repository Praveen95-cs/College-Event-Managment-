const express=require('express'); const router=express.Router();
const mongoose=require('mongoose');
const {body,validationResult}=require('express-validator'); const {auth,optionalAuth,authorize}=require('../../middleware/auth');
const Event=require('../../models/events/Event'); const Notification=require('../../models/community/Notification'); const Registration=require('../../models/events/Registration');
const Competition=require('../../models/competitions/Competition'); const AssessmentAssignment=require('../../models/competitions/AssessmentAssignment');
const Club=require('../../models/feed/Club');
const {sanitizePlainText,sanitizeTags}=require('../../utils/sanitize');
const {computeEventLifecycle,deriveEventCategory,syncEventToFeed,cleanupFeedForEvent}=require('../../services/feed/feedService');
const multer=require('multer'); const path=require('path'); const fs=require('fs');
const uploads=path.join(__dirname,'..','..','uploads'); fs.mkdirSync(uploads,{recursive:true});
const upload=multer({storage:multer.diskStorage({destination:(_,f,cb)=>cb(null,uploads),filename:(_,f,cb)=>cb(null,Date.now()+'-'+Math.round(Math.random()*1e9)+path.extname(f.originalname))}),limits:{fileSize:5*1024*1024},fileFilter:(_,f,cb)=>['image/jpeg','image/png','image/gif'].includes(f.mimetype)?cb(null,true):cb(new Error('Only JPEG, PNG and GIF are allowed'))});
const list=v=>!v?[]:Array.isArray(v)?v.map(String).map(x=>x.trim()).filter(Boolean):String(v).split(/\r?\n|,/).map(x=>x.trim()).filter(Boolean);
const novelty=b=>({highlights:list(b.highlights),perks:list(b.perks),agenda:list(b.agenda),certificateEnabled:b.certificateEnabled===undefined?true:['true','on',true].includes(b.certificateEnabled)});
router.get('/public',async(req,res)=>{try{const f={status:{$nin:['rejected','cancelled']}};if(req.query.department)f.department=req.query.department;if(req.query.type)f.type=req.query.type;if(req.query.search)f.$or=['title','description'].map(k=>({[k]:{$regex:req.query.search,$options:'i'}}));res.json(await Event.find(f).populate('club','name slug logo').select('title description date time location department type category tags eligibility registrationDeadline registrationOpen capacity attendees photo status club').sort({date:1}).limit(50));}catch(e){res.status(500).json({message:'Failed to load events'});}});
router.get('/',auth,async(req,res)=>{const f={}; if(req.user.role==='student')f.status={$nin:['rejected','cancelled']}; if(req.query.department)f.department=req.query.department;if(req.query.type)f.type=req.query.type;if(req.query.search)f.$or=['title','description'].map(k=>({[k]:{$regex:req.query.search,$options:'i'}}));res.json(await Event.find(f).populate('organizer','name email').populate('club','name slug logo').sort({date:1}));});
router.get('/:id',optionalAuth,async(req,res)=>{const e=await Event.findById(req.params.id).populate('organizer','name email').populate('attendees','name email').populate('club','name slug logo description followersCount');if(!e)return res.status(404).json({message:'Event not found'});const hidden=['rejected','cancelled'];if(hidden.includes(e.status)&&req.user?.role==='student')return res.status(404).json({message:'Event not found'});res.json(e);});
router.post('/',auth,authorize('admin','organizer'),upload.single('photo'),[
 body('title').trim().notEmpty(),body('description').trim().notEmpty(),body('date').isISO8601(),body('time').trim().notEmpty(),body('location').trim().notEmpty(),body('capacity').isInt({min:1}),body('department').trim().notEmpty(),body('type').isIn(['tech','non-tech','special','workshop'])
],async(req,res)=>{const er=validationResult(req);if(!er.isEmpty())return res.status(400).json({errors:er.array()});try{
 let clubId=null;
 if(req.body.club&&mongoose.Types.ObjectId.isValid(req.body.club)){
  const clubDoc=await Club.findById(req.body.club);
  if(clubDoc&&(req.user.role==='admin'||clubDoc.admins.some(a=>a.toString()===req.user._id.toString()))){
   clubId=clubDoc._id;
  }
 }
 const tags=sanitizeTags(req.body.tags);
 const category=req.body.category?sanitizePlainText(req.body.category,40):deriveEventCategory({...req.body,tags});
 const eligibility=req.body.eligibility?sanitizePlainText(req.body.eligibility,300):'Open to all enrolled students';
 const e=await Event.create({...req.body,status:req.body.status||'approved',capacity:Number(req.body.capacity),organizer:req.user._id,club:clubId,category,tags,eligibility,registrationDeadline:req.body.registrationDeadline||null,photo:req.file?`/uploads/${req.file.filename}`:'',noveltyFeatures:novelty(req.body)});
 await syncEventToFeed(e,{notifyFollowers:true});
 res.status(201).json(e);
}catch(e){res.status(500).json({message:e.message});}});
async function update(req,res){const e=await Event.findById(req.params.id);if(!e)return res.status(404).json({message:'Event not found'});if(req.user.role!=='admin'&&e.organizer.toString()!==req.user._id.toString())return res.status(403).json({message:'Not authorized'});const payload={...req.body};if(payload.club==='')payload.club=null;if(payload.registrationDeadline==='')payload.registrationDeadline=null;Object.assign(e,payload);if(['highlights','perks','agenda','certificateEnabled'].some(k=>req.body[k]!==undefined))e.noveltyFeatures={...e.noveltyFeatures.toObject(),...novelty(req.body)};await e.save();await syncEventToFeed(e,{notifyFollowers:true});res.json(e);}
router.put('/:id',auth,authorize('admin','organizer'),update); router.patch('/:id',auth,authorize('admin','organizer'),update);
router.delete('/:id', auth, authorize('admin', 'organizer'), async (req, res) => {
  try {
    const e = await Event.findById(req.params.id);
    if (!e) return res.status(404).json({ message: 'Event not found' });
    if (req.user.role !== 'admin' && e.organizer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to delete this event' });
    }

    // 1. Find and delete all competitions associated with this event
    const linkedComps = await Competition.find({ event: e._id });
    if (linkedComps.length > 0) {
      const compIds = linkedComps.map(c => c._id);
      // Delete all assignments for these competitions
      await AssessmentAssignment.deleteMany({ competition: { $in: compIds } });
      // Delete the competitions
      await Competition.deleteMany({ _id: { $in: compIds } });
    }

    // 2. Delete all registrations for this event
    await Registration.deleteMany({ event: e._id });

    // 3. Delete all notifications referencing this event
    await Notification.deleteMany({ relatedEvent: e._id });

    // 3b. Clean up Campus Feed posts, likes, saves, and comments linked to this event
    await cleanupFeedForEvent(e._id);

    // 4. Clean up photo from disk if present to free storage space
    if (e.photo && e.photo.startsWith('/uploads/')) {
      const photoPath = path.join(__dirname, '..', '..', e.photo);
      if (fs.existsSync(photoPath)) {
        try { fs.unlinkSync(photoPath); } catch (err) { console.warn('Could not remove event photo:', err.message); }
      }
    }

    // 5. Delete the event document
    await e.deleteOne();
    res.json({
      message: 'Event and all associated competitions, bookings, and files deleted successfully to clean up space',
      deletedCompetitionsCount: linkedComps.length
    });
  } catch (err) {
    console.error('Error deleting event:', err);
    res.status(500).json({ message: err.message || 'Error deleting event' });
  }
});
router.post('/register',auth,async(req,res)=>{try{const eventId=req.body.eventId||req.body.id;if(!eventId)return res.status(400).json({message:'eventId is required'});const e=await Event.findById(eventId);if(!e)return res.status(404).json({message:'Event not found'});const lc=computeEventLifecycle(e);if(['cancelled','rejected'].includes(e.status)||lc.registrationState==='REGISTRATION CLOSED')return res.status(400).json({message:'Registration is closed for this event'});if(lc.registrationState==='EVENT COMPLETED')return res.status(400).json({message:'This event has already completed'});if(e.attendees.length>=e.capacity)return res.status(400).json({message:'Event is full'});await e.addAttendee(req.user._id);const r=await Registration.findOneAndUpdate({event:e._id,user:req.user._id},{event:e._id,user:req.user._id,name:req.body.name||req.user.name,regNo:req.body.regNo||req.user._id.toString().slice(-8),needsAccommodation:!!req.body.needsAccommodation,status:'approved'},{upsert:true,new:true,setDefaultsOnInsert:true});await Notification.create({user:req.user._id,title:'Event Booking Confirmation',message:`You have successfully booked for ${e.title}`,type:'event_booking',relatedEvent:e._id});res.status(201).json({message:'Event booked successfully',registrationId:r._id,registration:r});}catch(e){res.status(400).json({message:e.message});}});
router.post('/:id/book',auth,async(req,res)=>{try{const e=await Event.findById(req.params.id);if(!e)return res.status(404).json({message:'Event not found'});const lc=computeEventLifecycle(e);if(['cancelled','rejected'].includes(e.status)||lc.registrationState==='REGISTRATION CLOSED')return res.status(400).json({message:'Registration is closed for this event'});if(lc.registrationState==='EVENT COMPLETED')return res.status(400).json({message:'This event has already completed'});if(e.attendees.length>=e.capacity)return res.status(400).json({message:'Event is full'});await e.addAttendee(req.user._id);const r=await Registration.findOneAndUpdate({event:e._id,user:req.user._id},{event:e._id,user:req.user._id,name:req.body.name||req.user.name,regNo:req.body.regNo||req.user._id.toString().slice(-8),needsAccommodation:!!req.body.needsAccommodation,status:'approved'},{upsert:true,new:true,setDefaultsOnInsert:true});await Notification.create({user:req.user._id,title:'Event Booking Confirmation',message:`You have successfully booked for ${e.title}`,type:'event_booking',relatedEvent:e._id});res.json({message:'Event booked successfully',registrationId:r._id,registration:r});}catch(e){res.status(400).json({message:e.message});}});
router.post('/:id/cancel',auth,async(req,res)=>{const e=await Event.findById(req.params.id);if(!e)return res.status(404).json({message:'Event not found'});await e.removeAttendee(req.user._id);await Registration.findOneAndUpdate({event:e._id,user:req.user._id},{status:'cancelled'});await Notification.create({user:req.user._id,title:'Booking Cancelled',message:`Your booking for ${e.title} has been cancelled`,type:'event_cancellation',relatedEvent:e._id});res.json({message:'Booking cancelled successfully'});});
router.post('/verify-payment',async(req,res)=>res.json({success:true,status:'succeeded'}));
module.exports=router;
