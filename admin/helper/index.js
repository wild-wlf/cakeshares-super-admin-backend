const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');
const jwtDecode = require('jwt-decode');
const { secret, aws_s3_bucket_name, aws_region, aws_access_key, aws_secret_access_key } = require('../config');
const { ROLE } = require('../models');
const aws = require('aws-sdk');

const bucketName = aws_s3_bucket_name;
const region = aws_region;
const accessKeyId = aws_access_key;
const secretAccessKey = aws_secret_access_key;

const s3 = new aws.S3({
  region,
  accessKeyId,
  secretAccessKey,
});

exports.hashPassword = text => {
  const salt = bcryptjs.genSaltSync(10);
  const passwordHashed = bcryptjs.hashSync(text, salt);
  return passwordHashed;
};
exports.comparePassword = (text, hash) => {
  return bcryptjs.compareSync(text, hash);
};

exports.generateToken = payload => {
  const token = jwt.sign(payload, secret, {
    expiresIn: '30 days', // 120 minutes (2 hours)
    algorithm: 'HS256',
  });
  return token;
};

exports.decodeToken = token => {
  return jwtDecode(token);
};

exports.filterQuery = req => ({
  ...req.query,
  page: req.query.page ? Number(req.query.page) : 1,
  itemsPerPage: req.query.itemsPerPage ? Number(req.query.itemsPerPage) : req.query.perPage ? Number(req.query.perPage) : 10,
  searchText: req.query.searchText !== 'null' && req.query.searchText !== 'undefined' && req.query.searchText ? req.query.searchText : '',
  startDate: req.query.startDate !== 'null' && req.query.startDate !== 'undefined' && req.query.startDate ? req.query.startDate : '',
  endDate: req.query.endDate !== 'null' && req.query.endDate !== 'undefined' && req.query.endDate ? req.query.endDate : '',
});

exports.pagination = (items = [], page = 1, totalItems = 0, itemsPerPage = 5, getAll) => {
  return {
    currentPage: page,
    hasNextPage: getAll === 'true' ? false : itemsPerPage * page < totalItems,
    hasPreviousPage: page > 1,
    nextPage: page + 1,
    previousPage: page - 1,
    lastPage: Math.ceil(totalItems / itemsPerPage),
    totalItems,
    items,
  };
};

exports.rolesFilter = async query => {
  const myQuery = {
    type: { $regex: `.*${query}.*`, $options: 'i' },
  };

  const rolesFilter = await ROLE.find(myQuery).select('_id');
  return rolesFilter.map(e => e._id);
};

exports.uploadImages = async (inputFiles, folderName) => {
  const uploadResults = {};
  const locations = {};

  const mimeTypes = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'application/pdf': 'pdf',
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
exports.removeFromS3 = async fileName => {
  try {
    const params = {
      Bucket: aws_s3_bucket_name,
      Key: fileName,
    };
    let response = await s3.deleteObject(params).promise();
    return response;
  } catch {
    return { DeleteMarker: false };
  }
};
