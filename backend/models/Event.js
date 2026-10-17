const mongoose = require('mongoose');
const schema = new mongoose.Schema({
 title:{type:String,required:true,trim:true}, description:{type:String,required:true},
 date:{type:Date,required:true}, time:{type:String,required:true}, location:{type:String,required:true},
 department:{type:String,required:true},
 type:{type:String,enum:['tech','non-tech','special','workshop'],required:true},
 capacity:{type:Number,required:true,min:1},
 organizer:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true},
 attendees:[{type:mongoose.Schema.Types.ObjectId,ref:'User'}],
 motivationContent:{
  quotes:[{text:String,author:String,generatedAt:Date}],
  tips:[{text:String,generatedAt:Date}], lastUpdated:Date
 },
 noveltyFeatures:{
  highlights:[String], perks:[String], agenda:[String],
  certificateEnabled:{type:Boolean,default:true}
 },
 status:{type:String,enum:['pending','approved','rejected','upcoming','ongoing','completed','cancelled'],default:'pending'},
 photo:{type:String,default:''}
},{timestamps:true});
schema.virtual('isFull').get(function(){ return this.attendees.length >= this.capacity; });
schema.methods.addAttendee = async function(userId){
 if(this.isFull) throw new Error('Event is full');
 if(this.attendees.some(id=>id.toString()===userId.toString())) throw new Error('User is already registered for this event');
 this.attendees.push(userId); return this.save();
};
schema.methods.removeAttendee = async function(userId){
 this.attendees=this.attendees.filter(id=>id.toString()!==userId.toString()); return this.save();
};
module.exports = mongoose.model('Event', schema);
