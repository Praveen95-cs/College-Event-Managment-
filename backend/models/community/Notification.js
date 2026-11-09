const mongoose=require('mongoose');
module.exports=mongoose.model('Notification',new mongoose.Schema({
 user:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true},
 title:{type:String,required:true},message:{type:String,required:true},
 type:{type:String,default:'general'},relatedEvent:{type:mongoose.Schema.Types.ObjectId,ref:'Event'},
 read:{type:Boolean,default:false}
},{timestamps:true}));
