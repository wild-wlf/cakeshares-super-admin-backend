const { PERMISSION, ROLE, ADMIN } = global;
const { filterQuery, pagination } = require('../helper');
const defaultRoles = require('../helper/defaultRoles');

module.exports = {
  createRole: async (req, res) => {
    const { type, description, permissions } = req.body;

    const isPresent = await ROLE.findOne({ type });

    if (isPresent) {
      throw new Error('Role exists with this same type:409');
    }

    if (!type || !description || !permissions) {
      throw new Error('Data is invalid:400');
    }

    let newPermissions = await PERMISSION.find({
      can: { $in: permissions },
    }).select('_id');

    newPermissions = [...new Set(newPermissions.map(e => e._id).flat())];

    await ROLE.create({
      type,
      description,
      permissions: newPermissions,
    });

    return res.status(200).send({
      code: 200,
      message: 'Role Added Successfully',
      success: true,
      data: newPermissions,
    });
  },

  getAllRoles: async (req, res) => {
    let { endDate, startDate, searchText, itemsPerPage, page } = filterQuery(req);

    const query = { $and: [{}] };

    if (searchText && !searchText?.includes('?')) {
      query.$and.push({
        $or: [{ type: { $regex: searchText, $options: 'i' } }, { description: { $regex: searchText, $options: 'i' } }],
      });
    } else if (searchText?.includes('?')) {
      return res.status(405).json({
        code: 405,
        success: false,
        message: 'Special Characters such as ? is not allowed',
      });
    }
    if (startDate && endDate) {
      let start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      let end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      query.$and.push({ created_at: { $gte: start, $lt: end } });
    }
    if (req.query.filterRoles && req.query.filterRoles !== '') {
      query.$and.push({
        type: { $regex: req.query.filterRoles, $options: 'i' },
      });
    }
    const count = await ROLE.countDocuments(query);
    if (req.query.getAll === 'true') {
      page = 1;
      itemsPerPage = count;
    }
    const roles = await ROLE.find(query)
      .populate({
        path: 'permissions',
        model: PERMISSION,
      })
      .skip((page - 1) * itemsPerPage)
      .limit(itemsPerPage)
      .sort({ createdAt: -1 });

    const allRolesInDb = await ROLE.countDocuments();

    return res.status(200).json({
      code: 200,
      message: 'Roles fetched successfully',
      allRolesInDb,
      ...pagination(roles, page, count, itemsPerPage),
    });
  },

  updateRole: async (req, res) => {
    const { id } = req.params;

    const adminWithThisRole = await ADMIN.find({ roles: { $in: id } }).select('_id');

    const { type, description, permissions } = req.body;

    const isPresent = await ROLE.find({ type: type });

    if (isPresent.length > 1) {
      throw new Error('Duplicate type not allowed:409');
    }

    if (!type && !description && !permissions) {
      res.status(400).json({
        code: 400,
        success: false,
        mmessage: 'Data is invalid',
      });
    }
    let newPermissions = await PERMISSION.find({
      can: { $in: permissions },
    });
    const permissionToAddInAdmin = newPermissions.map(e => e.can);

    newPermissions = newPermissions.map(e => e._id).flat();

    adminWithThisRole.forEach(async _ => {
      await ADMIN.findByIdAndUpdate(_, { $set: { permissions: permissionToAddInAdmin } });
    });

    await ROLE.findByIdAndUpdate(id, {
      type,
      description,
      permissions: newPermissions,
    });

    return res.status(200).json({
      code: 200,
      success: true,
      message: 'Role updated Successfully',
    });
  },

  deleteRole: async (req, res) => {
    const { id } = req.params;

    const role = await ROLE.findByIdAndDelete(id);

    if (!role) {
      return res.status(409).json({
        code: 409,
        success: true,
        message: 'Role not found!',
      });
    }

    await ADMIN.updateMany({ roles: id }, { $pull: { roles: id } });

    res.status(200).json({
      code: 200,
      success: true,
      message: 'Role deleted Successfully',
    });
  },

  restoreRole: async (req, res) => {
    const roleId = req.body.id;
    const hardCodedRoles = defaultRoles();
    const dbRole = await ROLE.findOne({ _id: roleId });
    let roleExistPermissions = {};
    hardCodedRoles?.map(ele => {
      if (ele.type === dbRole?.type) {
        roleExistPermissions = ele;
      }
    });

    if (!Object.keys(roleExistPermissions)?.length) {
      res.status(200).json({
        code: 200,
        success: false,
        message: 'Default Role not Exist',
      });
    }
    const new_permissions = await PERMISSION.find({
      can: { $in: roleExistPermissions.permissions.map(val => val.can) },
    })
      .select('_id can')
      .lean();
    const new_permissions_id = new_permissions.map(({ _id }) => _id?.toString());
    await ROLE.findOneAndUpdate({ _id: roleId }, { $set: { permissions: new_permissions_id } });
    res.status(200).json({
      code: 200,
      success: true,
      message: 'Role Restored Successfully',
    });
  },
};
