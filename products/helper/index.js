/* eslint-disable multiline-ternary */
const bcryptjs = require('bcryptjs');
const aws = require('aws-sdk');
const jwt = require('jsonwebtoken');
const jwtDecode = require('jwt-decode');
const { USER, ADMIN, ROLE, PRODUCT, NOTIFICATION, CATEGORY } = global;
const { S3 } = aws;
const axios = require('axios');
const { secret, aws_access_key, aws_secret_access_key, aws_region, aws_s3_bucket_name, access_key, base_url } = require('../config');

const bucketName = aws_s3_bucket_name;
const region = aws_region;
const accessKeyId = aws_access_key;
const secretAccessKey = aws_secret_access_key;

const s3 = new S3({
  region,
  accessKeyId,
  secretAccessKey,
});

exports.allowedOrigins = ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3004'];

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

exports.filterQuery = req => ({
  ...req.query,
  page: req.query.page ? Number(req.query.page) : 1,
  itemsPerPage: req.query.itemsPerPage ? Number(req.query.itemsPerPage) : req.query.perPage ? Number(req.query.perPage) : 10,
  searchText: req.query.searchText !== 'null' && req.query.searchText !== 'undefined' && req.query.searchText ? req.query.searchText : '',
  startDate: req.query.startDate !== 'null' && req.query.startDate !== 'undefined' && req.query.startDate ? req.query.startDate : '',
  endDate: req.query.endDate !== 'null' && req.query.endDate !== 'undefined' && req.query.endDate ? req.query.endDate : '',
  getAll: req.query.getAll !== 'null' && req.query.getAll !== 'undefined' && req.query.getAll ? Boolean(req.query.getAll) : false,
});

exports.filterUserQuery = req => ({
  ...req.query,
  page: req.query.page ? Number(req.query.page) : 1,
  itemsPerPage: req.query.itemsPerPage ? Number(req.query.itemsPerPage) : req.query.perPage ? Number(req.query.perPage) : 10,
  searchText: req.query.searchText !== 'null' && req.query.searchText !== 'undefined' && req.query.searchText ? req.query.searchText : '',
  startDate: req.query.startDate !== 'null' && req.query.startDate !== 'undefined' && req.query.startDate ? req.query.startDate : '',
  endDate: req.query.endDate !== 'null' && req.query.endDate !== 'undefined' && req.query.endDate ? req.query.endDate : '',
  type: req.query.type !== 'null' && req.query.type !== 'undefined' && req.query.type ? req.query.type : '',
  kycLevel: req.query.kycLevel !== 'null' && req.query.kycLevel !== 'undefined' && req.query.kycLevel ? Number(req.query.kycLevel) : '',
  status: req.query.status !== 'null' && req.query.status !== 'undefined' && req.query.status ? req.query.status : '',
  accType: req.query.accType !== 'null' && req.query.accType !== 'undefined' && req.query.accType ? req.query.accType : '',
  section: req.query.section !== 'null' && req.query.section !== 'undefined' && req.query.section ? req.query.section : '',
});

exports.filterAdvancedSearchQuery = req => ({
  ...req.query,
  page: req.query.page ? Number(req.query.page) : 1,
  itemsPerPage: req.query.itemsPerPage ? Number(req.query.itemsPerPage) : req.query.perPage ? Number(req.query.perPage) : 10,
  searchText: req.query.searchText !== 'null' && req.query.searchText !== 'undefined' && req.query.searchText ? req.query.searchText : '',
  investmentType: req.query.investmentType !== 'null' && req.query.investmentType !== 'undefined' && req.query.investmentType ? req.query.investmentType : '',
  kycLevel: req.query.kycLevel !== 'null' && req.query.kycLevel !== 'undefined' && req.query.kycLevel ? Number(req.query.kycLevel) : '',
  minInvestmentVolume: req.query.minInvestmentVolume !== 'null' && req.query.minInvestmentVolume !== 'undefined' && req.query.minInvestmentVolume ? Number(req.query.minInvestmentVolume) : '',
  maxInvestmentVolume: req.query.maxInvestmentVolume !== 'null' && req.query.maxInvestmentVolume !== 'undefined' && req.query.maxInvestmentVolume ? Number(req.query.maxInvestmentVolume) : '',
  valueRaised: req.query.valueRaised !== 'null' && req.query.valueRaised !== 'undefined' && req.query.valueRaised ? Number(req.query.valueRaised) : '',
  minimumBackers: req.query.minimumBackers !== 'null' && req.query.minimumBackers !== 'undefined' && req.query.minimumBackers ? Number(req.query.minimumBackers) : '',
  country: req.query.country !== 'null' && req.query.country !== 'undefined' && req.query.country ? req.query.country : '',
  daysLeft: req.query.daysLeft !== 'null' && req.query.daysLeft !== 'undefined' && req.query.daysLeft ? Number(req.query.daysLeft) : '',
  maxAnnualCost: req.query.maxAnnualCost !== 'null' && req.query.maxAnnualCost !== 'undefined' && req.query.maxAnnualCost ? Number(req.query.maxAnnualCost) : '',
});

exports.hashPassword = password => {
  const salt = bcryptjs.genSaltSync(10);
  const passwordHashed = bcryptjs.hashSync(password, salt);
  return passwordHashed;
};

exports.comparePassword = (password, hashedPassword) => {
  return bcryptjs.compareSync(password, hashedPassword);
};

exports.parseJSON = json => {
  try {
    return typeof json === 'string' ? JSON.parse(json) : json;
  } catch (error) {
    throw new Error('Invalid JSON Format!');
  }
};

exports.uploadImages = async (inputFiles, folderName) => {
  const uploadResults = {};
  const locations = {};

  const mimeTypes = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'application/pdf': 'pdf',
    'video/mp4': 'mp4',
    'video/mpeg': 'mpeg',
    'video/avi': 'avi',
  };

  const uploadFile = async (file, key) => {
    let filename = file.originalname;
    const fileExtension = mimeTypes[file.mimetype];
    if (!filename.includes(`.${fileExtension}`)) {
      filename += `.${fileExtension}`;
    }

    // Replace unnecessary characters with underscores in the filename
    filename = filename.replace(/[^a-zA-Z0-9._]/g, '_');
    const uploadPath = `${folderName}/${filename}`;

    try {
      const uploadResult = await s3
        .upload({
          Bucket: bucketName,
          Body: file.buffer,
          Key: uploadPath,
          ContentType: file.mimetype,
        })
        .promise();

      if (!uploadResults[key]) {
        uploadResults[key] = [];
      }
      if (!locations[key]) {
        locations[key] = [];
      }
      uploadResults[key].push(uploadResult.key);
      locations[key].push(uploadResult.Location);
    } catch ({ message }) {
      throw new Error(`Error uploading ${filename} : ${message}`);
    }
  };

  try {
    // Check if inputFiles is a single file or multiple files
    if (inputFiles && inputFiles.fieldname && inputFiles.buffer) {
      // Single file scenario
      await uploadFile(inputFiles, inputFiles.fieldname);
    } else if (inputFiles && typeof inputFiles === 'object') {
      // Multiple files scenario
      const uploadPromises = [];
      for (const key in inputFiles) {
        if (Object.prototype.hasOwnProperty.call(inputFiles, key)) {
          const fileArray = Array.isArray(inputFiles[key]) ? inputFiles[key] : [inputFiles[key]];
          fileArray.forEach(file => {
            if (file && file.buffer) {
              uploadPromises.push(uploadFile(file, key));
            }
          });
        }
      }
      await Promise.all(uploadPromises);
    }
  } catch ({ message }) {
    throw new Error(message);
  }

  return { uploadResults, locations };
};

exports.generatePreSignedUrl = async key => {
  try {
    const singleKey = Array.isArray(key) ? key[0] : key;
    const signedUrl = s3.getSignedUrl('getObject', {
      Bucket: bucketName,
      Key: singleKey,
      Expires: 604800,
    });

    return signedUrl;
  } catch (error) {
    throw new Error('Error generating signed URL');
  }
};

exports.removeFromS3 = async fileName => {
  try {
    const params = {
      Bucket: bucketName,
      Key: fileName,
    };
    let response = await s3.deleteObject(params).promise();
    return response;
  } catch {
    return { DeleteMarker: false };
  }
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

exports.adminFilter = async query => {
  const myQuery = {
    fullName: { $regex: `.*${query}.*`, $options: 'i' },
  };

  const adminFilter = await ADMIN.find(myQuery).select('_id');
  return adminFilter.map(e => e._id);
};

exports.userFilter = async query => {
  const myQuery = {
    $or: [{ fullName: { $regex: `.*${query}.*`, $options: 'i' } }, { sellerType: { $regex: `.*${query}.*`, $options: 'i' } }],
  };

  const userFilter = await USER.find(myQuery).select('_id');
  return userFilter.map(e => e._id);
};

exports.productFilter = async query => {
  const myQuery = {
    $or: [{ productName: { $regex: `.*${query}.*`, $options: 'i' } }],
  };

  const productFilter = await PRODUCT.find(myQuery).select('_id');
  return productFilter.map(e => e._id);
};

exports.investmentTypeFilter = async query => {
  const myQuery = {
    name: { $regex: '.*' + query + '.*', $options: 'i' },
  };

  const investmentTypeFilter = await CATEGORY.find(myQuery).select('_id');
  return investmentTypeFilter.map(e => e._id);
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
