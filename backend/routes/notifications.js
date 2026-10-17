const router=require('express').Router();const {auth}=require('../middleware/auth');const N=require('../models/Notification');
router.get('/',auth,async(req,res)=>res.json(await N.find({user:req.user._id}).sort({createdAt:-1})));
router.put('/:id/read',auth,async(req,res)=>{const n=await N.findOneAndUpdate({_id:req.params.id,user:req.user._id},{read:true},{new:true});if(!n)return res.status(404).json({message:'Notification not found'});res.json(n);});
router.delete('/:id',auth,async(req,res)=>{const n=await N.findOneAndDelete({_id:req.params.id,user:req.user._id});if(!n)return res.status(404).json({message:'Notification not found'});res.json({message:'Deleted'});});
module.exports=router;
