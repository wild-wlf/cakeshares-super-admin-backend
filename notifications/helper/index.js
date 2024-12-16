const jwt = require('jsonwebtoken');
const jwtDecode = require('jwt-decode');
const { getSocketServerInstance } = require('./socketHandlers/socketStore');
const { ADMIN, ROLE, USER, PRODUCT, NOTIFICATION } = global;
const { secret, access_key, base_url } = require('../config');
const axios = require('axios');

exports.allowedOrigins = ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3004'];

exports.filterQuery = req => ({
  ...req.query,
  page: req.query.page ? Number(req.query.page) : 1,
  itemsPerPage: req.query.itemsPerPage ? Number(req.query.itemsPerPage) : req.query.perPage ? Number(req.query.perPage) : 10,
  searchText: req.query.searchText !== 'null' && req.query.searchText !== 'undefined' && req.query.searchText ? req.query.searchText : '',
  startDate: req.query.startDate !== 'null' && req.query.startDate !== 'undefined' && req.query.startDate ? req.query.startDate : '',
  endDate: req.query.endDate !== 'null' && req.query.endDate !== 'undefined' && req.query.endDate ? req.query.endDate : '',
  getAll: req.query.getAll !== 'null' && req.query.getAll !== 'undefined' && req.query.getAll ? Boolean(req.query.getAll) : false,
});

exports.pagination = (items, page, totalItems, itemsPerPage, getAll) => {
  items = items || [];
  page = page || 1;
  totalItems = totalItems || 0;
  itemsPerPage = itemsPerPage || 10;
  return {
    items,
    currentPage: page,
    hasNextPage: getAll === 'true' ? false : itemsPerPage * page < totalItems,
    hasPreviousPage: page > 1,
    nextPage: page + 1,
    previousPage: page - 1,
    lastPage: Math.ceil(totalItems / itemsPerPage),
    totalItems,
  };
};

exports.generateToken = payload => {
  const token = jwt.sign(payload, secret, {
    expiresIn: '2 hours',
    algorithm: 'HS256',
  });

  return token;
};

exports.decryptToken = token => {
  const decrypted = jwtDecode(token);
  const iat = new Date(decrypted.iat * 1000);
  const exp = new Date(decrypted.exp * 1000);
  return { iat, exp };
};

exports.createNotification = async (recipients, notificationData, adminRoles, socketNotifications) => {
  if (!notificationData) {
    return false;
  }

  try {
    const { actionType, title, message } = notificationData;

    let adminIds = [];
    if (adminRoles?.length > 0) {
      const roles = await ROLE.find({ type: { $in: adminRoles } }).select('_id');
      const roleIds = roles.map(role => role._id);

      const admins = await ADMIN.find({ roles: { $in: roleIds } }).select('_id');
      adminIds = admins.map(admin => admin._id);
    }

    const allRecipients = [...new Set([...recipients, ...adminIds])];

    const createdNotifications = await Promise.all(
      allRecipients.map((recipientId, index) =>
        NOTIFICATION.create({
          recipientId,
          actionType,
          title,
          message: message[index],
        }),
      ),
    );

    if (socketNotifications?.sellerNotification) {
      await this.sendSocketNotification({ event: 'sellerNotification' });
    }
    if (socketNotifications?.buyerNotification) {
      await this.sendSocketNotification({ event: 'buyerNotification' });
    }
    if (socketNotifications?.adminNotification) {
      await this.sendSocketNotification({ event: 'adminNotification' });
    }

    return createdNotifications;
  } catch (error) {
    console.error('Error creating notification:', error);
    return {};
  }
};

exports.sendSocketNotification = async payload => {
  try {
    const headers = {
      Authorization: `Bearer ${access_key}`,
    };
    await axios.post(`${base_url}/notification/v1/send-socket-notification`, payload, {
      headers,
    });
  } catch (error) {
    console.error('Error calling common service:', error);
  }
};

exports.removeSpaces = (str = '') => {
  return str.replace(/ /g, '');
};

exports.filterParticipants = async query => {
  const myQuery = {
    fullName: { $regex: `.*${query}.*`, $options: 'i' },
  };

  const [userResults, adminResults] = await Promise.all([USER.find(myQuery).select('_id'), ADMIN.find(myQuery).select('_id')]);

  const allParticipants = [...userResults.map(e => e._id), ...adminResults.map(e => e._id)];

  return allParticipants;
};

exports.filterProducts = async query => {
  const myQuery = {
    productName: { $regex: `.*${query}.*`, $options: 'i' },
  };

  const productResults = await PRODUCT.find(myQuery).select('_id');

  return productResults.map(ele => ele._id.toString());
};

// exports.sendSocketNotification = async payload => {
//   try {
//     const headers = {
//       Authorization: `Bearer ${access_key}`,
//     };
//     await axios.post(`${base_url}/notification/v1/send-socket-notification`, payload, {
//       headers,
//     });
//   } catch (error) {
//     console.error('Error calling common service:', error);
//   }
// };
