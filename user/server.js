const mongoose = require('mongoose');
const http = require('http');
const express = require('express');
const cors = require('cors');
const useragent = require('express-useragent');
const morgan = require('morgan');
require('./models');
const { mongo_string, port } = require('./config');

mongoose.Promise = global.Promise;
mongoose
  .connect(mongo_string)
  .then(() => {
    console.log('MongoDB connected');
  })
  .catch(err => console.log(err));
// eslint-disable-next-line no-undef
process.title = 'CAKESHARES-USER';

const app = express();
const server = http.createServer(app);
app.set('trust proxy', 1);

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(useragent.express());
app.use(morgan('tiny'));

app.use('/user', require('./routes'));
app.use((req, res) => {
  res.status(404).send({ url: `${req.originalUrl} not found` });
});

server.listen(port, () => {
  console.log('--------------------------------------------------------------');
  console.log(`Server started on port ${port}`);
  console.log('--------------------------------------------------------------');
});
