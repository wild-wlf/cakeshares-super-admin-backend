const jwt = require('jsonwebtoken');
const { secret } = require('../config');
const { ADMIN, ADMIN_JWT, USER, USER_JWT } = global;

module.exports = async (req, res, next) => {
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
        message: `${err.name}: ${err.message}`,
      });
    }

    const admin = await ADMIN.findById(decodedToken.id);
    const user = !admin ? await USER.findById(decodedToken.id) : null;

    if (!admin && !user) {
      return res.status(401).send({
        error: true,
        message: 'Unauthorized!',
      });
    }

    if (admin) {
      const isValidAdminToken = await ADMIN_JWT.findOne({ token });
      if (!isValidAdminToken) {
        return res.status(401).send({
          error: true,
          message: 'Kindly Login Again!',
        });
      }
      req.owner = admin;
      req.isAdmin = true;
    } else {
      const isValidUserToken = await USER_JWT.findOne({ token });
      if (!isValidUserToken) {
        return res.status(401).send({
          error: true,
          message: 'Kindly Login Again!',
        });
      }

      req.isUser = true;
      req.owner = user;
    }

    next();
  });
};
