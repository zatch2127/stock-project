
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;

mongoose.connect(process.env.MONGO_URI, {
}).then(() => {
  console.log('Connected to MongoDB');
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}).catch(err => {
  console.error('Connection to MongoDB failed', err);
});




const rewardsRouter = require('./routes/rewards');
app.use('/api/rewards', rewardsRouter);

const stocksRouter = require('./routes/stocks');
app.use('/api/stocks', stocksRouter);

const usersRouter = require('./routes/users');
app.use('/api/users', usersRouter);

const historicalRouter = require('./routes/historical');
app.use('/historical-inr', historicalRouter);
