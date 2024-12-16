const jwt = require('jsonwebtoken');
const { secret } = require('../config');

const verifyToken = async token => {
  try {
    return await jwt.verify(token, secret);
  } catch (err) {
    console.log(err, 'err');
    console.log(`${err.name}: ${err.message}`);
  }
};

module.exports = verifyToken;
