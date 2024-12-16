const { USER, ROLE, PERMISSION, USER_JWT, BANK, INHERITANCE, WALLET, INVESTMENT, PRODUCT } = global;
const mongoose = require('mongoose');
const { filterUserQuery, pagination, hashPassword, comparePassword, generateToken, decryptToken, uploadImages, parseJSON, createNotification, removeFromS3, createCustomerInStripeWhenSignUp, generateUsername } = require('../helper');
const { google_login_api_key } = require('../config');
const axios = require('axios');

module.exports = {
  getAllUsers: async (req, res) => {
    // eslint-disable-next-line prefer-const
    let { page, itemsPerPage, startDate, endDate, searchText, type, kycLevel, status, accType } = {
      ...req.query,
      ...filterUserQuery(req),
    };

    const query = {
      $and: [],
    };

    if (type) {
      query.$and.push({
        type,
      });
    }
    if (kycLevel) {
      query.$and.push({
        kycLevel: +kycLevel,
      });
    }
    if (status) {
      query.$and.push({
        status: status,
      });
    }
    if (accType) {
      query.$and.push({
        sellerType: accType,
      });
    }

    if (startDate && endDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query?.$and.push({ created_at: { $gte: start, $lt: end } });
    }

    searchText = searchText && searchText !== 'undefined' && searchText !== 'null' ? searchText : '';
    query.$and.push({
      $or: [{ fullName: { $regex: new RegExp(searchText, 'i') } }, { username: { $regex: new RegExp(searchText, 'i') } }, { email: { $regex: new RegExp(searchText, 'i') } }],
    });

    const totalUsers = await USER.countDocuments(query).exec();

    const users = await USER.aggregate([
      { $match: query },
      { $lookup: { from: 'bank', localField: 'bank', foreignField: '_id', as: 'bankDetails' } },
      { $lookup: { from: 'inheritance', localField: '_id', foreignField: 'userId', as: 'inheritances' } },
      { $lookup: { from: 'product', localField: '_id', foreignField: 'userId', as: 'userProducts' } },
      { $lookup: { from: 'wallet', localField: '_id', foreignField: 'userId', as: 'wallet' } },
      {
        $lookup: {
          from: 'request-payment',
          let: { userId: '$_id' },
          pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$userId', '$$userId'] }, { $eq: ['$status', 'pending'] }] } } }, { $limit: 1 }],
          as: 'requestPaymentWallet',
        },
      },
      { $lookup: { from: 'investment', localField: '_id', foreignField: 'userId', as: 'investment' } },
      // Lookup products for the investments
      { $lookup: { from: 'product', localField: 'investment.product', foreignField: '_id', as: 'productForCat' } },
      // Lookup categories for buyer's products
      { $lookup: { from: 'category', localField: 'productForCat.investmentType', foreignField: '_id', as: 'buyerCategories' } },
      // Lookup categories for seller's products
      { $lookup: { from: 'category', localField: 'userProducts.investmentType', foreignField: '_id', as: 'sellerCategories' } },
      {
        $addFields: {
          totalProducts: {
            $cond: {
              if: { $eq: ['$type', 'Seller'] },
              then: { $size: '$userProducts' },
              else: null,
            },
          },
          totalAssets: {
            $cond: {
              if: { $eq: ['$type', 'Buyer'] },
              then: {
                $size: {
                  $setUnion: ['$investment.product'],
                },
              },
              else: null,
            },
          },
          totalInvestmentAmount: { $sum: '$investment.investmentAmount' },
          totalRevenue: {
            $cond: { if: { $eq: ['$type', 'Seller'] }, then: { $sum: '$userProducts.valueRaised' }, else: null },
          },
          uniqueBuyerCategories: {
            $reduce: {
              input: '$buyerCategories',
              initialValue: [],
              in: {
                $concatArrays: [
                  '$$value',
                  {
                    $cond: {
                      if: {
                        $in: ['$$this._id', '$$value._id'],
                      },
                      then: [],
                      else: [
                        {
                          _id: '$$this._id',
                          name: '$$this.name',
                          icon: '$$this.icon',
                        },
                      ],
                    },
                  },
                ],
              },
            },
          },
          uniqueSellerCategories: {
            $reduce: {
              input: '$sellerCategories',
              initialValue: [],
              in: {
                $concatArrays: [
                  '$$value',
                  {
                    $cond: {
                      if: {
                        $in: ['$$this._id', '$$value._id'],
                      },
                      then: [],
                      else: [
                        {
                          _id: '$$this._id',
                          name: '$$this.name',
                          icon: '$$this.icon',
                        },
                      ],
                    },
                  },
                ],
              },
            },
          },
        },
      },
      {
        $project: {
          username: 1,
          email: 1,
          profilePicture: 1,
          fullName: 1,
          country: 1,
          dob: 1,
          kycLevel: 1,
          type: 1,
          sellerType: 1,
          isIndividualSeller: 1,
          totalAssets: 1,
          totalRevenue: 1,
          totalInvestmentAmount: 1,
          bank: { $arrayElemAt: ['$bankDetails', 0] },
          inheritances: 1,
          isVerified: 1,
          registrationStatus: 1,
          totalProducts: 1,
          status: 1,
          verificationStatus: 1,
          isKycRequested: 1,
          kycRequestLevel: 1,
          wallet: {
            $toString: { $arrayElemAt: ['$wallet.totalAmount', 0] },
          },
          requestPaymentWallet: {
            amount: { $toString: { $arrayElemAt: ['$requestPaymentWallet.amount', 0] } },
            paymentProofDocument: { $arrayElemAt: ['$requestPaymentWallet.paymentProofDocument', 0] },
            status: { $arrayElemAt: ['$requestPaymentWallet.status', 0] },
          },
          uniqueBuyerCategories: 1,
          uniqueSellerCategories: 1,
          created_at: 1,
          updated_at: 1,
        },
      },
      { $sort: { updated_at: -1 } },
      { $skip: (page - 1) * itemsPerPage },
      { $limit: itemsPerPage },
    ]).exec();

    const allUsersinDb = await USER.countDocuments();

    return res.status(200).json({
      success: true,
      message: 'Users Retrieved Successfully!',
      allUsersinDb,
      ...pagination(users, +page, totalUsers, +itemsPerPage),
    });
  },

  registration: async (req, res) => {
    const { bankInfo, inheritanceInfo, ...userData } = req.body;
    const { type, sellerType } = req.body;

    const existingUser = await USER.findOne({
      $or: [{ username: { $regex: `^${userData.username}$`, $options: 'i' } }, { email: { $regex: new RegExp(`^${userData.email.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}$`, 'i') } }],
    }).exec();

    if (existingUser) {
      const error = existingUser.username.toLowerCase() === userData.username.toLowerCase() ? 'Username is Already Taken!' : 'Email is Already Registered!';
      return res.status(400).json({ success: false, message: error });
    }

    if (bankInfo) {
      const parsedBankInfo = parseJSON(bankInfo);

      const duplicateBank = await BANK.findOne({
        $or: [
          { iban: parsedBankInfo.iban },
          { swiftBicNumber: parsedBankInfo.swiftBicNumber },
          // { userId: parsedBankInfo.userId }
        ],
      });

      if (duplicateBank) {
        if (duplicateBank.iban === parsedBankInfo.iban) {
          return res.status(400).json({ success: false, message: 'IBAN is already registered.' });
        } else if (duplicateBank.swiftBicNumber === parsedBankInfo.swiftBicNumber) {
          return res.status(400).json({ success: false, message: 'SWIFT/BIC number is already registered!' });
        }
        //  else if (duplicateBank.userId === parsedBankInfo.userId) {
        //   return res.status(400).json({ success: false, message: 'User ID is already associated with a bank account!' });
        // }
      }
    }

    const hashedPassword = hashPassword(userData.password);

    let roleToFind;
    if (type === 'Buyer') {
      roleToFind = 'BUYER';
      userData.isVerified = true;
      userData.status = 'Active';
      userData.verificationStatus = 'approved';
    } else if (type === 'Seller' && sellerType === 'Individual') {
      roleToFind = 'INDIVIDUAL_SELLER';
    } else if (type === 'Seller' && sellerType === 'Company') {
      roleToFind = 'COMPANY_SELLER';
    }

    const role = await ROLE.findOne({ type: roleToFind }).select('_id');

    if (req.file) {
      const currentTime = Date.now();
      const { locations } = await uploadImages(req.file, `Registration/${currentTime}`);
      userData.profilePicture = locations.profilePicture[0];
    }

    let bank, inheritanceArray;
    if (bankInfo) {
      const parsedBankInfo = parseJSON(bankInfo);
      bank = new BANK(parsedBankInfo);
    } else {
      bank = new BANK({});
    }

    const user = new USER({
      ...userData,
      role: role ? role._id : null,
      password: hashedPassword,
      dob: userData.dob ? new Date(userData.dob) : null,
    });

    const stripeCustomer = await createCustomerInStripeWhenSignUp(userData.email, userData.fullName);

    user.stripeCustomerId = stripeCustomer.id;

    if (bank) {
      user.bank = bank._id;
    }

    if (inheritanceInfo) {
      const parsedInheritanceInfo = parseJSON(inheritanceInfo);
      inheritanceArray = parsedInheritanceInfo.map(info => new INHERITANCE({ userId: user._id, ...info }));
    }

    await user.save();

    if (bank) await bank.save();

    if (inheritanceArray && inheritanceArray.length > 0) {
      for (const inheritance of inheritanceArray) {
        await inheritance.save();
      }
    }

    await WALLET.create({ userId: user?._id });

    const notificationData = {
      actionType: 'user_created',
      title: 'New User Account Created!',
      message: [`A new user account has been created for ${user.username}.`],
    };

    await createNotification([], notificationData, ['SUPER_ADMIN'], {
      adminNotification: true,
    });

    return res.status(200).json({ success: true, message: 'User Registered Successfully!' });
  },

  updateUser: async (req, res) => {
    const { id } = req.params;
    const { bankInfo, inheritanceInfo, ...userData } = req.body;

    const existingUser = await USER.findOne({
      $or: [{ username: userData.username }, { email: userData.email }],
      $and: [{ _id: { $ne: id } }],
    });

    if (existingUser) {
      const error = existingUser.username === userData.username ? 'Username is Already Taken.' : 'Email is Already Registered.';
      return res.status(400).json({ success: false, message: error });
    }

    const user = await USER.findById(id);

    let bankId;
    if (bankInfo) {
      const parsedBankInfo = parseJSON(bankInfo);

      if (parsedBankInfo._id) {
        const duplicateBank = await BANK.findOne({
          $or: [{ iban: { $eq: parsedBankInfo.iban, $ne: '' } }, { swiftBicNumber: { $eq: parsedBankInfo.swiftBicNumber, $ne: '' } }, { userId: { $eq: parsedBankInfo.userId, $ne: '' } }],
          _id: { $ne: parsedBankInfo._id },
        });

        if (duplicateBank) {
          if (duplicateBank.iban === parsedBankInfo.iban) {
            return res.status(400).json({ success: false, message: 'IBAN is already registered.' });
          } else if (duplicateBank.swiftBicNumber === parsedBankInfo.swiftBicNumber) {
            return res.status(400).json({ success: false, message: 'SWIFT/BIC number is already registered.' });
          } else if (duplicateBank.userId === parsedBankInfo.userId) {
            return res.status(400).json({ success: false, message: 'User ID is already associated with a bank account.' });
          }
        }
      }

      if (parsedBankInfo._id) {
        await BANK.findByIdAndUpdate(parsedBankInfo._id, { ...parsedBankInfo });
      } else {
        const { _id, ...remainingInfo } = parsedBankInfo;
        const bank = new BANK(remainingInfo);
        await bank.save();
        bankId = bank._id;
      }
      userData.bank = bankId;
    }

    if (userData.dob) {
      userData.dob = new Date(userData.dob);
    }

    if (inheritanceInfo && inheritanceInfo.length > 0) {
      const parsedInheritanceInfo = parseJSON(inheritanceInfo);
      for (const inheritance of parsedInheritanceInfo) {
        if (inheritance._id) {
          await INHERITANCE.findByIdAndUpdate(inheritance._id, { ...inheritance }, { upsert: true });
        } else {
          const newInheritance = new INHERITANCE({ userId: id, ...inheritance });
          await newInheritance.save();
        }
      }
    }

    if (req.file) {
      const currentTime = Date.now();
      const { locations } = await uploadImages(req.file, `Registration/${currentTime}`);
      await removeFromS3(user?.profilePicture?.split('.com/')[1]);
      userData.profilePicture = locations.profilePicture[0];
    }

    // const io = getSocketServerInstance();
    // if (userData.hasOwnProperty('isVerified')) {
    //   io.emit('userUpdated', { id, approved: userData.isVerified });
    // }

    if (user?.status === 'Suspended') {
      const notificationData = {
        actionType: 'user_unsuspended',
        title: 'User Unsuspended!',
        message: [`${user?.fullName || user?.username} has been Unsuspended.`],
      };

      await createNotification([], notificationData, ['SUPER_ADMIN'], {
        adminNotification: true,
      });
    }

    await USER.findByIdAndUpdate(id, { ...userData });

    return res.status(200).json({ success: true, message: 'User Updated Successfully!' });
  },

  updateBankDetails: async (req, res) => {
    const { id } = req.params;
    const bankDetails = req.body;

    const isDuplicateBank = await BANK.findOne({
      $or: [
        { iban: { $eq: bankDetails.iban } },
        { swiftBicNumber: { $eq: bankDetails.swiftBicNumber } },
        //  { userId: { $eq: bankDetails.userId } }
      ],
      _id: { $ne: id },
    });

    if (isDuplicateBank) {
      if (isDuplicateBank.iban === bankDetails.iban) {
        return res.status(400).json({ success: false, message: 'IBAN is already registered.' });
      } else if (isDuplicateBank.swiftBicNumber === bankDetails.swiftBicNumber) {
        return res.status(400).json({ success: false, message: 'SWIFT/BIC number is already registered.' });
      } else if (isDuplicateBank.userId === bankDetails.userId) {
        return res.status(400).json({ success: false, message: 'User ID is already associated with a bank account.' });
      }
    }

    await BANK.findByIdAndUpdate(id, { $set: bankDetails });

    return res.status(200).json({
      success: true,
      message: 'Bank Information Updated Successfully!',
    });
  },

  updateChunkInfo: async (req, res) => {
    const { id } = req.params;
    const { type, info } = req.body;

    const user = await USER.findById(id);

    if (req.files && type === 'picture') {
      const currentTime = Date.now();
      let { locations } = await uploadImages(req.files, `Registeration/${currentTime}`);
      await removeFromS3(user?.profilePicture?.split('.com/')[1]);
      const fieldName = Object.keys(locations)[0];
      await USER.findByIdAndUpdate(id, { $set: { [fieldName]: locations[fieldName][0] } });
      return res.status(200).json({ success: true, message: 'Image Updated Successfully!' });
    }

    if (type === 'bank') {
      await BANK.findByIdAndUpdate(id, { ...info });
    } else if (type === 'inheritance') {
      if (id) {
        await INHERITANCE.findByIdAndUpdate(id, { ...info }, { upsert: true });
      } else {
        if (!info?.userId) {
          return res.status(400).json({ success: false, message: 'Missing userId for Inheritance Creation!' });
        }
        await INHERITANCE.create({ ...info });
      }
    } else if (type === 'personal') {
      await USER.findByIdAndUpdate(id, { ...info, dob: new Date(info?.dob) });
    }

    return res.status(200).json({ success: true, message: 'User Data Updated Successfully!' });
  },

  updatePassword: async (req, res) => {
    const { id } = req.params;
    const { currentPassword, newPassword } = req.body;

    const user = await USER.findById(id).select('password');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not Found!' });
    }

    const isPasswordCorrect = comparePassword(currentPassword, user?.password);

    if (!isPasswordCorrect) {
      return res.status(403).json({ success: false, message: 'Current Password is Incorrect!' });
    }

    const hashedPassword = hashPassword(newPassword);

    await USER.findByIdAndUpdate(id, { $set: { password: hashedPassword } });

    return res.status(200).json({ success: true, message: 'Password Updated Successfully!' });
  },

  login: async (req, res) => {
    const { username, password, type, sellerType } = req.body;

    if (!type) {
      return res.status(400).json({ success: false, message: 'User Type is Required!' });
    }

    const query = { username: { $regex: `^${username.toLowerCase()}$`, $options: 'i' } };

    if (type === 'Buyer') {
      query.type = 'Buyer';
    } else if (type === 'Seller') {
      query.type = 'Seller';
    }

    const isUser = await USER.findOne(query);

    if (!isUser) {
      return res.status(401).json({ success: false, message: 'Incorrect Username or Password' });
    }

    if (!comparePassword(password, isUser.password)) {
      return res.status(401).json({ success: false, message: 'Incorrect Username or Password' });
    }

    const token = generateToken({
      id: isUser?._id,
      username: isUser?.username,
    });
    const decryptedToken = decryptToken(token);

    await USER_JWT.findOneAndUpdate(
      { user_id: isUser?._id },
      {
        user_id: isUser._id,
        token,
        iat: decryptedToken.iat,
        exp: decryptedToken.exp,
      },
      { upsert: true },
    );
    const role = await ROLE.findOne({ _id: isUser.role }).select('-_id type permissions');
    const filterPermissions = [...new Set(role.permissions?.map(_ => _).flat())];
    let permissions = [];

    permissions = await PERMISSION.find({ _id: { $in: filterPermissions } })
      .select('-_id can')
      .lean()
      .then(permissions => permissions.map(item => `/${item.can}`));

    return res.status(200).json({
      success: true,
      message: 'Logged In Successfully!',
      type: isUser?.type,
      isIndividualSeller: isUser?.isIndividualSeller,
      isVerified: isUser?.isVerified,
      token,
      permissions,
    });
  },

  googleLogin: async (req, res) => {
    const { access_token, type, sellerType, action } = req.body;

    const response = await axios.get(google_login_api_key, {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    });

    const googleUser = response?.data;

    if (!googleUser) {
      return res.status(400).json({ success: false, message: 'Invalid Google token' });
    }

    // Find user by email
    let isUser = await USER.findOne({ email: googleUser.email });
    let message;

    if (action === 'Login') {
      if (!isUser) {
        return res.status(400).json({ success: false, message: 'User not found. Please register first.' });
      }

      if (isUser.type !== type) {
        return res.status(400).json({ success: false, message: 'User not found. Please register first.' });
      }

      message = 'Logged In Successfully!';
    } else if (action === 'Register') {
      if (isUser) {
        if (isUser.type !== type) {
          return res.status(400).json({ success: false, message: 'Account already exists with this Google account.' });
        }

        return res.status(400).json({ success: false, message: 'Account already exists with this Google account.' });
      }

      let roleToFind;
      if (type === 'Buyer') {
        roleToFind = 'BUYER';
      } else if (type === 'Seller' && sellerType === 'Individual') {
        roleToFind = 'INDIVIDUAL_SELLER';
      } else if (type === 'Seller' && sellerType === 'Company') {
        roleToFind = 'COMPANY_SELLER';
      }

      const role = await ROLE.findOne({ type: roleToFind }).select('_id');
      const hashedPassword = hashPassword(googleUser.sub);

      isUser = new USER({
        username: await generateUsername(googleUser.email),
        email: googleUser.email,
        fullName: googleUser.name,
        type,
        password: hashedPassword,
        profilePicture: googleUser.picture,
        isVerified: type === 'Buyer',
        status: type === 'Buyer' ? 'Active' : 'Pending',
        verificationStatus: type === 'Buyer' ? 'approved' : 'pending',
        role: role ? role._id : null,
        ...(sellerType && { sellerType }),
      });

      await isUser.save();
      message = 'Signed Up Successfully!';
    }

    const token = generateToken({
      id: isUser?._id,
      username: isUser?.username,
    });
    const decryptedToken = decryptToken(token);

    await USER_JWT.findOneAndUpdate(
      { user_id: isUser?._id },
      {
        user_id: isUser._id,
        token,
        iat: decryptedToken.iat,
        exp: decryptedToken.exp,
      },
      { upsert: true },
    );

    const role = await ROLE.findOne({ _id: isUser.role }).select('-_id type permissions');
    const filterPermissions = [...new Set(role.permissions?.map(_ => _).flat())];
    const permissions = await PERMISSION.find({ _id: { $in: filterPermissions } })
      .select('-_id can')
      .lean()
      .then(permissions => permissions.map(item => `/${item.can}`));

    return res.status(200).json({
      success: true,
      message,
      type: isUser?.type,
      isIndividualSeller: isUser?.isIndividualSeller,
      isVerified: isUser?.isVerified,
      token,
      permissions,
    });
  },

  logout: async (req, res) => {
    await USER_JWT.deleteOne({
      user_id: req.user._id,
    });

    return res.status(200).json({ code: 200, message: 'Logged Out Successfully!' });
  },

  me: async (req, res) => {
    const userData = req.user.toObject();

    let permissions = [];
    let role_type = '';
    const role = await ROLE.find({ _id: { $in: userData.role } }).select('-_id type permissions');
    const filterPermissions = [...new Set(role.map(_ => _.permissions).flat())];
    if (userData?.isVerified) {
      permissions = await PERMISSION.find({ _id: { $in: filterPermissions } })
        .select('-_id can')
        .lean()
        .then(permissions => permissions.map(item => `/${item.can}`));
      role_type = role.map(_ => _.type);
    } else {
      if (userData?.type !== 'Buyer') permissions = ['/dashboard.nav'];
      else permissions = ['/buyer.nav'];
    }

    let user = await USER.aggregate([
      { $match: { _id: userData?._id } },
      {
        $lookup: {
          from: 'bank',
          localField: 'bank',
          foreignField: '_id',
          as: 'bankDetails',
        },
      },
      {
        $lookup: {
          from: 'inheritance',
          localField: '_id',
          foreignField: 'userId',
          as: 'inheritances',
        },
      },
      {
        $lookup: {
          from: 'wallet',
          localField: '_id',
          foreignField: 'userId',
          as: 'wallet',
        },
      },
      {
        $project: {
          fullDocument: '$$ROOT',
          bank: { $arrayElemAt: ['$bankDetails', 0] },
          inheritances: 1,
          wallet: {
            $toString: { $arrayElemAt: ['$wallet.totalAmount', 0] },
          },
        },
      },
      {
        $replaceRoot: {
          newRoot: {
            $mergeObjects: ['$fullDocument', { bank: '$bank', inheritances: '$inheritances', wallet: '$wallet' }],
          },
        },
      },
      {
        $unset: 'bankDetails',
      },
    ]).exec();

    user = user[0];
    delete user.password;

    return res.status(200).json({
      success: true,
      message: 'User Fetched Successfully!',
      roleType: role_type,
      permissions,
      approved: user.isVerified,
      type: user?.type,
      user,
    });
  },

  deleteInheritance: async (req, res) => {
    const { id } = req.params;
    await INHERITANCE.findByIdAndDelete(id);
    return res.status(200).json({ success: true, message: 'Inheritance Deleted Successfully!' });
  },

  deleteUser: async (req, res) => {
    const { id } = req.params;

    const user = await USER.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not Found!' });
    }

    if (user?.type === 'Buyer') {
      const investment = await INVESTMENT.findOne({ userId: id });
      if (investment) {
        return res.status(400).json({ success: false, message: "User has made investments. Can't be deleted" });
      }
    } else if (user?.type === 'Seller') {
      const product = await PRODUCT.findOne({ userId: id });
      if (product) {
        return res.status(400).json({ success: false, message: "User has products. Can't be deleted" });
      }
    }

    await INHERITANCE.deleteMany({ userId: id });
    await BANK.findByIdAndDelete(user.bank);
    await USER.findByIdAndDelete(id);

    return res.status(200).json({ success: true, message: 'User and Related Records Deleted Successfully!' });
  },

  getSingleUser: async (req, res) => {
    const { id } = req.params;
    if (!id) return res.status(404).json({ success: false, message: 'User Id is Missing!' });

    const isUserExist = await USER.findOne({ _id: id });
    if (!isUserExist) {
      return res.status(404).json({ success: false, message: 'User not found!' });
    }

    const userId = new mongoose.Types.ObjectId(id);

    const results = await USER.aggregate([
      { $match: { _id: userId } },
      {
        $lookup: {
          from: 'product',
          localField: '_id',
          foreignField: 'userId',
          as: 'userProducts',
        },
      },
      {
        $addFields: {
          totalProjects: { $size: '$userProducts' },
        },
      },
      {
        $project: {
          fullName: 1,
          username: 1,
          email: 1,
          profilePicture: 1,
          bannerImage: 1,
          sellerType: 1,
          created_at: 1,
          type: 1,
          isVerified: 1,
          totalProjects: 1,
          userProducts: 1,
        },
      },
      {
        $facet: {
          user: [{ $project: { userProducts: 0 } }, { $limit: 1 }],
          otherProducts: [
            { $unwind: '$userProducts' },
            { $replaceRoot: { newRoot: '$userProducts' } },
            {
              $match: {
                userId,
                isVerified: true,
                deadline: { $gte: new Date() },
                $expr: { $lt: ['$valueRaised', '$assetValue'] },
              },
            },
            {
              $lookup: {
                from: 'category',
                localField: 'investmentType',
                foreignField: '_id',
                as: 'investmentTypeDoc',
              },
            },
            {
              $addFields: {
                investmentType: { $arrayElemAt: ['$investmentTypeDoc', 0] },
              },
            },
            { $project: { investmentTypeDoc: 0 } },
          ],
          topCategories: [
            { $unwind: '$userProducts' },
            { $replaceRoot: { newRoot: '$userProducts' } },
            { $match: { userId } },
            {
              $lookup: {
                from: 'category',
                localField: 'investmentType',
                foreignField: '_id',
                as: 'investmentTypeDoc',
              },
            },
            {
              $addFields: {
                category: {
                  name: { $arrayElemAt: ['$investmentTypeDoc.name', 0] },
                  icon: { $arrayElemAt: ['$investmentTypeDoc.icon', 0] },
                },
              },
            },
            {
              $project: {
                category: {
                  name: 1,
                  icon: 1,
                },
                userId: 1,
                productId: 1,
              },
            },
          ],
          fullyFundedProducts: [
            { $unwind: '$userProducts' },
            { $replaceRoot: { newRoot: '$userProducts' } },
            {
              $lookup: {
                from: 'category',
                localField: 'investmentType',
                foreignField: '_id',
                as: 'investmentTypeDoc',
              },
            },
            {
              $match: {
                $expr: { $eq: ['$valueRaised', '$assetValue'] },
                isVerified: true,
              },
            },
            {
              $addFields: {
                investmentType: { $arrayElemAt: ['$investmentTypeDoc', 0] },
              },
            },
            { $project: { investmentTypeDoc: 0 } },
          ],
        },
      },
    ]);
    let userCategories = [...new Map(results[0].topCategories?.map(ele => [ele?.category?.name, { name: ele?.category?.name, icon: ele?.category?.icon || '' }])).values()];

    const user = results[0].user[0];
    const otherProducts = results[0].otherProducts;
    const fullyFundedProducts = results[0].fullyFundedProducts;

    return res.status(200).json({
      success: true,
      message: 'User Retrieved Successfully!',
      user,
      otherProducts,
      userCategories,
      fullyFundedProducts,
    });
  },

  createBank: async (req, res) => {
    const { id } = req.params;
    const bankInfo = req.body;

    let user = await USER.findOne({ _id: id });

    if (!user) return res.status(404).json({ success: false, message: 'User Not Found!' });

    if (user?.bank) {
      await BANK.findOneAndUpdate({ _id: user?.bank?._id }, { $set: { ...bankInfo } });
    } else {
      const newBank = await BANK.create(bankInfo);
      user.bank = newBank?._id;
    }

    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Bank Details Updated Successfully!',
    });
  },
  deactivateUserAccount: async (req, res) => {
    const { id } = req.params;

    let user = await USER.findById(id);

    if (!user || user?.status === 'Pending') return res.status(404).json({ success: false, message: 'User Not Found or not active!' });

    await USER.findByIdAndUpdate(id, { $set: { status: 'Deactive' } });

    return res.status(200).json({
      success: true,
      message: 'User Deactivated!',
    });
  },
};
