const mongoose=require('mongoose');
module.exports=mongoose.model('Message',new mongoose.Schema({
 user:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true},
 content:{type:String,required:true,trim:true,maxlength:2000}
},{timestamps:true}));
