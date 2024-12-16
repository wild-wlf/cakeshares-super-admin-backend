const { PERMISSION, ROLE, ADMIN } = global;
const { filterQuery, pagination } = require('../helper');

module.exports = {
  createPermission: async (req, res) => {
    const { route, description, can, parent } = req.body;

    if (!can || !route || !description || !parent) {
      throw new Error('Data is invalid:400');
    }

    await PERMISSION.create({
      route,
      description,
      can: can.toLowerCase(),
      parent,
    });

    return res.status(200).send({
      code: 200,
      message: 'Permission Added Successfully',
      success: true,
    });
  },

  getAllPermissions: async (req, res) => {
    let { endDate, itemsPerPage, page, searchText, startDate, filterText } = filterQuery(req);
    const query = { $and: [{}] };
    if (searchText) {
      query.$and.push({
        $or: [{ can: { $regex: searchText, $options: 'i' } }, { route: { $regex: searchText, $options: 'i' } }, { description: { $regex: searchText, $options: 'i' } }],
      });
    }

    if (startDate && endDate) {
      let start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      let end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      query.$and.push({ created_at: { $gte: start, $lt: end } });
    }

    if (filterText) {
      query.$and.push({
        route: { $regex: '.*' + filterText + '.*', $options: 'i' },
      });
    }
    const count = await PERMISSION.countDocuments(query);
    if (req.query.getAll === 'true') {
      page = 1;
      itemsPerPage = count;
    }
    if (req.query.parentOnly === 'true') {
      page = 1;
      itemsPerPage = count;
      query.$and.push({ parent: { $eq: '$' } });
    }
    const permissions = await PERMISSION.find(query)
      .skip((page - 1) * itemsPerPage)
      .limit(itemsPerPage)
      .sort({ createdAt: -1 });

    const allPermissionsInDb = await PERMISSION.countDocuments();

    return res.status(200).json({
      code: 200,
      message: 'Permissions fetched successfully',
      allPermissionsInDb,
      ...pagination(permissions, page, count, itemsPerPage),
    });
  },

  restorePermissions: async (req, res) => {
    const defaultPermissions = require('../utils/defaultPermission.json');
    const defaultRoles = require('../utils/defaultRoles');
    const roles = defaultRoles();

    await PERMISSION.deleteMany();
    await PERMISSION.create(defaultPermissions);

    roles.forEach(async role => {
      let old_role = await ROLE.findOne({ type: role.type });
      let new_permissions = await PERMISSIONS.find({
        can: { $in: role.permissions.map(val => val.can) },
      })
        .select('_id can')
        .lean();

      let new_permissions_id = new_permissions.map(({ _id }) => _id.toString());
      let new_permissions_can = new_permissions.map(({ can }) => can);

      if (old_role) {
        await ROLE.findOneAndUpdate({ _id: old_role._id }, { $set: { permissions: new_permissions_id } });
        await ADMIN.updateMany({ roles: { $in: [old_role._id] } }, { $set: { permissions: new_permissions_can } });
      } else {
        await ROLE.create({ type: role.type, permissions: new_permissions_id });
      }
    });

    return res.status(200).json({
      code: 200,
      message: 'permissions reseted successfully',
    });
  },

  deletePermission: async (req, res) => {
    const { id } = req.params;
    await PERMISSION.findByIdAndDelete(id);
    await ROLE.updateMany(
      {
        permissions: { $in: [id] },
      },
      { $pull: { permissions: id } },
    );
    return res.status(200).json({
      code: 200,
      message: 'Permission deleted successfully',
    });
  },

  updatePermission: async (req, res) => {
    const { id } = req.params;
    const { route, description, can, parent } = req.body;
    if (!can || !route || !description || !parent) {
      return res.status(400).json({
        code: 400,
        message: 'Invalid data!',
      });
    }
    await PERMISSION.findByIdAndUpdate(id, {
      $set: { route, description, can, parent },
    });
    return res.status(200).json({
      code: 200,
      message: 'Permission Updated Successfully',
    });
  },
};
