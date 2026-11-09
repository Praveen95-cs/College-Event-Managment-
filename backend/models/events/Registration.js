const mongoose=require('mongoose');
const schema=new mongoose.Schema({
 event:{type:mongoose.Schema.Types.ObjectId,ref:'Event',required:true},
 user:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true},
 name:{type:String,required:true,trim:true}, regNo:{type:String,required:true,trim:true},
 needsAccommodation:{type:Boolean,default:false},
 status:{type:String,enum:['pending','approved','rejected','cancelled'],default:'pending'}
},{timestamps:true});
schema.index({event:1,user:1},{unique:true});
module.exports=mongoose.model('Registration',schema);
