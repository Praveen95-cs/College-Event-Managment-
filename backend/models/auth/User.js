const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const schema = new mongoose.Schema({
  name:{type:String,required:true,trim:true},
  email:{type:String,required:true,unique:true,lowercase:true,trim:true},
  password:{type:String,required:true,minlength:8,select:false},
  role:{type:String,enum:['student','organizer','admin'],default:'student'},
  department:{type:String,default:'',trim:true}
},{timestamps:true});
schema.pre('save', async function(next){
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12); next();
});
schema.methods.comparePassword = function(value){ return bcrypt.compare(value, this.password); };
module.exports = mongoose.model('User', schema);
