const { hashPassword } = require('./index');
const { PERMISSION, ROLE, ADMIN } = global;
const mongoose = require('mongoose');

const first_admin_email = 'admin@cakeshares.com';
const first_admin_password = '1@2.comM';
async function seedRoles(cond) {
  try {
    const defaultPermissions = require('./defaultPermission.json');
    const defaultRoles = require('./defaultRoles');

    const roles = defaultRoles();

    const oldPerms = await PERMISSION.find({});

    console.log('before');
    for (const perm of defaultPermissions) {
      const isPermissionExists = oldPerms.find(oldPerm => oldPerm.can === perm.can);
      if (!isPermissionExists) {
        await PERMISSION.create(perm);
      } else {
        await PERMISSION.findByIdAndUpdate(isPermissionExists._id, perm);
      }
    }

    await Promise.all(
      roles.map(async role => {
        const old_role = await ROLE.findOne({ type: role.type });
        const new_permissions = await PERMISSION.find({
          can: { $in: role.permissions.map(val => val.can) },
        })
          .select('_id can')
          .lean();

        const new_permissions_id = new_permissions.map(permission => permission._id);

        if (old_role) {
          // Update existing role's permissions
          await ROLE.findOneAndUpdate({ _id: old_role._id }, { $set: { permissions: new_permissions_id } });
        } else {
          // Create a new role
          await ROLE.create({ type: role.type, permissions: new_permissions_id });
        }
      }),
    );

    if (!cond) {
      const admins = await ADMIN.find({});

      if (admins?.length > 0) {
        await Promise.all(
          admins?.map(async admin => {
            const role = await ROLE.findOne({ type: 'SUPER_ADMIN' })
              .populate({
                path: 'permissions',
                model: PERMISSION,
              })
              .lean();

            const new_permissions = await PERMISSION.find({
              can: { $in: role.permissions.map(val => val.can) },
            })
              .select('_id can')
              .lean();

            await ADMIN.findByIdAndUpdate(admin?._id?.toString(), {
              $set: { permissions: new_permissions.map(val => val.can) },
            });
          }),
        );
      }
    }

    console.log('Roles and permissions updated successfully.');
    createFirstAdmin();
    return true;
  } catch (error) {
    console.error('Error seeding default roles:', error);
    return false;
  }
}

async function createFirstAdmin() {
  const EMAIL = first_admin_email;
  const PASSWORD = first_admin_password;
  const ADMIN_ROLE = 'SUPER_ADMIN';

  try {
    const existingAdmin = await ADMIN.findOne();

    if (existingAdmin) {
      console.log('Admin already exists. Skipping creation.');
      return;
    }

    const hashedPassword = hashPassword(PASSWORD);

    const roles = await ROLE.find({ type: ADMIN_ROLE });

    let permissions_find_array = roles.map(r => r.permissions.flat()).flat();

    permissions_find_array = permissions_find_array.map(permission => new mongoose.Types.ObjectId(permission));

    let permissions = await PERMISSION.find({
      _id: { $in: permissions_find_array },
    });

    permissions = permissions.map(i => i.can);

    const adminCreated = await ADMIN.create({
      fullName: 'Super Admin',
      email: EMAIL,
      permissions,
      roles: [roles[0]._id],
      password: hashedPassword,
    });
    console.log('Admin created with this email', adminCreated.email);
  } catch (error) {
    console.error('Error creating admin user:', error);
  }
}

module.exports = {
  seedRoles,
  createFirstAdmin,
};
