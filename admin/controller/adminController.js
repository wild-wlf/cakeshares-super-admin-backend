const { ADMIN, ROLE, PERMISSION, ADMIN_JWT, ADMIN_LOGS } = global;
const { hashPassword, generateToken, comparePassword, decodeToken, filterQuery, pagination, rolesFilter, uploadImages, removeFromS3 } = require('../helper');
const { default: mongoose } = require('mongoose');

module.exports = {
  login: async (req, res) => {
    const { email, password } = req.body;

    const admin = await ADMIN.findOne({
      email,
    }).select('-updated_at -created_at');

    if (!admin || !comparePassword(password, admin.password)) {
      return res.status(402).json({
        success: false,
        message: 'Email or Password is Incorrect',
      });
    }

    const totalSessions = await ADMIN_JWT.countDocuments({
      admin_id: admin._id,
    });

    if (totalSessions > 0) {
      await ADMIN_JWT.deleteOne({ admin_id: admin._id });
    }

    const token = generateToken({
      id: admin._id,
      email,
    });

    if (!token) {
      return res.status(500).json({
        code: 500,
        success: false,
        message: 'Error generating token!',
      });
    }

    const decryptedToken = decodeToken(token);
    await ADMIN_JWT.create({
      admin_id: admin._id,
      token,
      iat: decryptedToken.iat,
      exp: decryptedToken.exp,
    });

    return res.status(200).json({
      status: true,
      message: 'Logged In Successful!',
      token,
      admin,
    });
  },

  logout: async (req, res) => {
    await ADMIN_JWT.deleteOne({
      admin_id: req.admin.id,
    });

    return res.status(200).json({ code: 200, message: 'Admin session updated' });
  },

  addAdmin: async (req, res) => {
    const { email } = req.body;

    let admin = await ADMIN.findOne({ email });

    if (admin) {
      throw new Error('Email address you provided is already in use:409');
    }
    const role = JSON.parse(req.body.roles) || [];

    let roles = await ROLE.find({
      _id: { $in: role?.map(i => new mongoose.Types.ObjectId(i)) },
    });

    let permissions_find_array = roles.map(r => r.permissions.flat()).flat();
    permissions_find_array = permissions_find_array.map(permission => new mongoose.Types.ObjectId(permission));

    let permissions = await PERMISSION.find({
      _id: { $in: permissions_find_array },
    });
    req.body.permissions = permissions.map(i => i.can);
    req.body.roles = role;

    let new_admin_request = req.body;

    new_admin_request.password = hashPassword(new_admin_request.password);

    if (req.file) {
      const currentTime = Date.now();
      const { locations } = await uploadImages(req.file, `Profile/${currentTime}`);
      new_admin_request.profilePicture = locations.profilePicture[0];
    }
    await ADMIN.create(new_admin_request);

    return res.status(200).send({
      code: 200,
      message: 'Admin is created Sucessfully!',
      success: true,
    });
  },

  deleteAdmin: async (req, res) => {
    let id = req.params.id;

    await ADMIN.deleteOne({
      _id: id,
    });

    return res.status(200).send({ code: 200, message: 'Admin is removed' });
  },

  forceLogoutAdmin: async (req, res) => {
    const { id } = req.params;
    const adminJwt = await ADMIN_JWT.findOne({ admin_id: id });
    if (!adminJwt || adminJwt?.token === '') {
      return res.status(200).json({
        code: 200,
        error: true,
        message: 'This admin is already logged out',
      });
    }
    await ADMIN_JWT.findOneAndUpdate({ admin_id: id }, { $set: { token: '' } });
    return res.status(200).json({
      code: 200,
      error: false,
      message: 'Successfully logged out',
    });
  },

  updateAdmin: async (req, res) => {
    const { id } = req.params;

    const payload = req.body;
    const counter = await ADMIN.findOne({ _id: id });

    let admin = {};
    if (counter) {
      Object.keys(payload).forEach(async element => {
        if (element === 'password') {
          payload[element] = hashPassword(payload[element]);
        }
        admin[element] = payload[element];
        if (req?.body?.roles) {
          const role = JSON.parse(req.body.roles) || [];
          admin.roles = role;
        }
      });

      if (req.file) {
        const currentTime = Date.now();
        const { locations } = await uploadImages(req.file, `Profile/${currentTime}`);
        await removeFromS3(counter?.profilePicture?.split('.com/')[1]);
        admin.profilePicture = locations.profilePicture[0];
      }
    }
    await ADMIN.findOneAndUpdate({ _id: id }, { $set: { ...admin } });

    return res.status(200).send({ code: 200, message: 'Admin updated', success: true });
  },
  updateAdminPassword: async (req, res) => {
    const { id } = req.params;

    const counter = await ADMIN.findOne({ _id: id });

    if (!counter) {
      return res.status(404).send({ code: 404, message: 'Not Found', success: false });
    }

    const password = hashPassword(req.body.password.trim());

    await ADMIN.findOneAndUpdate({ _id: id }, { $set: { password } });

    return res.status(200).send({ code: 200, message: 'Admin updated', success: true });
  },

  getAllAdmins: async (req, res) => {
    let { page, itemsPerPage, searchText, startDate, endDate } = filterQuery(req);

    let start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    let end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    let query = {
      $and: [],
      $or: [],
    };
    if (startDate && endDate) {
      query?.$and.push({ created_at: { $gte: start, $lt: end } });
    }
    if (req.query.filterRoles && req.query.filterRoles !== '') {
      query.$and.push({
        roles: {
          $in: (await rolesFilter(req.query.filterRoles)) ?? [],
        },
      });
    }
    if (searchText && searchText !== '') {
      query.$or = [
        {
          email: { $regex: '.*' + searchText + '.*', $options: 'i' },
        },
      ];
    }

    if (!query.$and.length > 0) {
      delete query.$and;
    }
    if (!query.$or.length > 0) {
      delete query.$or;
    }

    let totalItems = await ADMIN.countDocuments(query);
    if (req.query.getAll === 'true') {
      page = 1;
      itemsPerPage = totalItems;
    }
    let admins = await ADMIN.find(query)
      .populate({ path: 'roles', model: ROLE, select: 'type' })
      .sort([['created_at', -1]])
      .skip((page - 1) * itemsPerPage)
      .limit(itemsPerPage)
      .lean();

    const allAdminsInDb = await ADMIN.countDocuments();

    let data = pagination(admins, page, totalItems, itemsPerPage);

    return res.status(200).json({ ...data, allAdminsInDb, code: 200 });
  },

  suspendAdmin: async (req, res) => {
    const admin = await ADMIN.findOne({ _id: req.params.id });
    admin.is_suspended = !admin.is_suspended;
    await ADMIN_LOGS.create({
      action: 'Suspension',
      admin_id: admin._id,
      done_by: req.admin._id,
    });
    await admin.save();
    return res.status(200).json({ code: 200, message: 'Successfully Update Suspend Status', status: 200, statusText: 'OK' });
  },

  getMyPermissions: async (req, res) => {
    const adminMain = await ADMIN.findById(req.admin._id).select('-password -token').lean();

    // eslint-disable-next-line no-unused-vars
    const { permissions, ...rest } = adminMain;

    const admin = adminMain;

    const roles = await ROLE.find({ _id: { $in: admin.roles } }).select('_id type permissions');

    const filterPermissions = [...new Set(roles.map(_ => _.permissions).flat())];

    let permissions_comp = await PERMISSION.find({
      _id: { $in: filterPermissions },
    }).select('-_id can');

    permissions_comp = permissions_comp.map(e => e.can);

    const role_type = roles.map(_ => _.type);

    return res.status(200).json({
      code: 200,
      message: 'Permissions fetched successfully',
      ...rest,
      permissions: permissions_comp,
      role_type,
    });
  },
};
