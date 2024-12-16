const jwt = require('jsonwebtoken');
const { secret } = require('../config');
const { USER, USER_JWT } = global;

module.exports = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({
      error: true,
      message: 'Authorization Header Missing!',
    });
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).send({
      error: true,
      message: 'Token must be non-null!',
    });
  }

  jwt.verify(token, secret, async (err, decodedToken) => {
    if (err) {
      return res.status(401).send({
        error: true,
        message: `${`${err.name}:${err.message}`}`,
      });
    }
    const user = await USER.findById(decodedToken.id);
    if (!user) {
      return res.status(401).send({
        error: true,
        message: 'User Not Found!',
      });
    }

    const isValid = await USER_JWT.findOne({ token });
    if (!isValid) {
      return res.status(401).send({
        isUnAuthorized: true,
        message: 'Kindly Login Again!',
      });
    }

    req.user = user;
    next();
  });
};
