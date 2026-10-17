const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function run() {
  const uri = process.env.MONGODB_URI;
  await mongoose.connect(uri);
  const Event = mongoose.model('Event', new mongoose.Schema({}, { strict: false }));
  const result = await Event.updateMany({ status: 'pending' }, { $set: { status: 'approved' } });
  console.log('Update result:', result);
  const events = await Event.find({}, 'title status createdAt');
  console.log('Events in Atlas:', JSON.stringify(events, null, 2));
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
