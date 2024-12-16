const jwt = require('jsonwebtoken');
const { secret } = require('../config/index');
const { ADMIN, ADMIN_JWT } = global;

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
    const admin = await ADMIN.findById(decodedToken.id);
    if (!admin) {
      return res.status(401).send({
        error: true,
        message: 'Unauthorized!',
      });
    }

    const isValid = await ADMIN_JWT.findOne({ token });
    if (!isValid) {
      return res.status(401).send({
        isUnAuthorized: true,
        message: 'Kindly Login Again!',
      });
    }

    req.admin = admin;
    next();
  });
};
