const express = require('express');
require('express-group-routes');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { adminController, permissionController, roleController } = require('../controller');
const { window, max_limit } = require('../config');
const { isAdmin, tryCatch } = require('../middleware');

const limiter = rateLimit({
  windowMs: window * 1000,
  max: max_limit,
  message: `Too many requests to this end-point, please try again after ${window} seconds`,
});

const multer = require('multer');

const storage = multer.memoryStorage();
const upload = multer({ storage });

router.group('/v1', router => {
  router.get('/health', (req, res) => {
    res.status(200).send('Admin service is OK');
  });

  router.post('/login', tryCatch(adminController.login));
  router.delete('/logout', [isAdmin], tryCatch(adminController.logout));
  router.post('/add-admin', upload.single('profilePicture'), [isAdmin], tryCatch(adminController.addAdmin));
  router.put('/suspend-admin/:id', [isAdmin], tryCatch(adminController.suspendAdmin));
  router.delete('/delete-admin/:id', [isAdmin], tryCatch(adminController.deleteAdmin));
  router.put('/update-admin/:id', upload.single('profilePicture'), [isAdmin], tryCatch(adminController.updateAdmin));
  router.put('/update-admin-password/:id', [isAdmin], tryCatch(adminController.updateAdminPassword));
  router.get('/get-all-admins', [isAdmin], tryCatch(adminController.getAllAdmins));
  router.post('/force-logout-admin/:id', [isAdmin], tryCatch(adminController.forceLogoutAdmin));
  router.get('/perms', [isAdmin], tryCatch(adminController.getMyPermissions));

  router.post('/create-permission', [isAdmin], tryCatch(permissionController.createPermission));
  router.get('/get-all-permission', [isAdmin], tryCatch(permissionController.getAllPermissions));
  router.post('/restore-permissions', [isAdmin], tryCatch(permissionController.restorePermissions));
  router.delete('/delete-permission/:id', [isAdmin], tryCatch(permissionController.deletePermission));
  router.put('/update-permission/:id', [isAdmin], tryCatch(permissionController.updatePermission));

  router.post('/create-role', [isAdmin], tryCatch(roleController.createRole));
  router.get('/get-all-role', [isAdmin], tryCatch(roleController.getAllRoles));

  router.put('/update-role/:id', [isAdmin], tryCatch(roleController.updateRole));
  router.delete('/delete-role/:id', [isAdmin], tryCatch(roleController.deleteRole));
  router.post('/restore-role', [isAdmin], tryCatch(roleController.restoreRole));
});

module.exports = router;
