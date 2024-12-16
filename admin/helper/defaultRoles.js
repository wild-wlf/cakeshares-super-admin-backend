const defaultPermissions = require('./defaultPermission.json');

const defaultRoles = () => {
  return [
    {
      type: 'SUPER_ADMIN',
      permissions: defaultPermissions,
    },
    {
      type: 'BUYER',
      permissions: defaultPermissions,
    },
    {
      type: 'INDIVIDUAL_SELLER',
      permissions: defaultPermissions,
    },
    {
      type: 'COMPANY_SELLER',
      permissions: defaultPermissions,
    },
  ];
};

module.exports = defaultRoles;
