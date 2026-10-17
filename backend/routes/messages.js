const router=require('express').Router();const {auth,authorize}=require('../middleware/auth');const M=require('../models/Message');
router.get('/',auth,async(req,res)=>res.json(await M.find().populate('user','name role').sort({createdAt:-1}).limit(200)));
router.post('/',auth,async(req,res)=>{if(!req.body.content?.trim())return res.status(400).json({message:'Content required'});let m=await M.create({user:req.user._id,content:req.body.content.trim()});m=await m.populate('user','name role');res.status(201).json(m);});
router.delete('/:id',auth,authorize('admin','organizer'),async(req,res)=>{const m=await M.findByIdAndDelete(req.params.id);if(!m)return res.status(404).json({message:'Message not found'});res.json({message:'Deleted'});});
module.exports=router;
