const mongoose=require('mongoose');
const schema=new mongoose.Schema({
 event:{type:mongoose.Schema.Types.ObjectId,ref:'Event',required:true},
 user:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true},
 name:{type:String,required:true,trim:true}, regNo:{type:String,required:true,trim:true},
 email:{type:String,default:'',lowercase:true,trim:true},
 needsAccommodation:{type:Boolean,default:false},
 status:{type:String,enum:['pending','approved','rejected','cancelled'],default:'pending'},
 attendanceStatus:{type:String,enum:['unmarked','present','absent'],default:'unmarked'},
 attendedAt:{type:Date,default:null},
 attendanceMarkedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User',default:null},
 paymentStatus:{type:String,enum:['free','pending','paid','failed','refunded'],default:'free'},
 amountPaid:{type:Number,default:0,min:0},
 currency:{type:String,default:'INR',trim:true},
 paymentMethod:{type:String,enum:['free','youpi','upi','card','netbanking','stripe'],default:'free'},
 transactionId:{type:String,default:'',trim:true},
 youpiPaymentId:{type:String,default:'',trim:true},
 youpiOrderId:{type:String,default:'',trim:true},
 youpiStatus:{type:String,default:'',trim:true},
 settlementState:{type:String,default:'',trim:true},
 paidAt:{type:Date,default:null},
 confirmationEmailSentAt:{type:Date,default:null},
 confirmationEmailTo:{type:String,default:'',trim:true}
},{timestamps:true});
schema.index({event:1,user:1},{unique:true});
module.exports=mongoose.model('Registration',schema);
