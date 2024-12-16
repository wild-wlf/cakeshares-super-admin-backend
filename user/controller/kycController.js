const { USER, KYC } = global;
const { uploadImages, generatePreSignedUrl, extractKey, parseJSON, createNotification, sendSocketNotification } = require('../helper');

module.exports = {
  requestKyc: async (req, res) => {
    const { userId, kycRequestLevel, ownerDetails, bankDetails, taxNumber } = req.body;
    if (!userId || !kycRequestLevel) return res.status(404).json({ success: false, message: 'Invalid Data!' });

    const user = await USER.findOne({ _id: userId });

    if (user?.isKycRequested) return res.status(200).json({ success: true, message: 'You already requested for KYC Upgrade. Please wait for Approval!' });

    if (user?.kycLevel === 3) return res.status(200).json({ success: true, message: "Your KYC Level is already 3. Can't Upgrade!" });

    let passportImageFront, passportImageBack, residenceProofImage, companyDocumentImage, finalData;

    if (req.files) {
      const currentTime = Date.now();
      let { locations } = await uploadImages(req.files, `Kyc/${currentTime}`);
      if (user?.type !== 'Buyer') {
        const parsedBankDetails = parseJSON(bankDetails);
        passportImageFront = locations?.passportImageFront?.[0] || '';
        passportImageBack = locations?.passportImageBack?.[0] || '';
        residenceProofImage = locations?.residenceProofImage?.[0] || '';
        personalImage = locations?.personalImage?.[0] || '';

        if (user?.sellertype === 'Individual') {
          finalData = {
            userId,
            passportImageFront,
            passportImageBack,
            residenceProofImage,
            bankDetails: parsedBankDetails,
            personalImage,
          };
        } else {
          const parsedOwnerDetails = parseJSON(ownerDetails);
          companyDocumentImage = locations?.companyDocumentImage?.[0] || '';

          finalData = {
            userId,
            passportImageFront,
            passportImageBack,
            residenceProofImage,
            bankDetails: parsedBankDetails,
            ownerDetails: parsedOwnerDetails,
            taxNumber,
            personalImage,
            companyDocumentImage,
          };
        }
      } else if (kycRequestLevel === 1 || kycRequestLevel === '1') {
        passportImageFront = locations?.passportImageFront[0] || '';
        passportImageBack = locations?.passportImageBack[0] || '';
        finalData = {
          userId,
          passportImageFront,
          passportImageBack,
        };
      } else if (kycRequestLevel === 2 || kycRequestLevel === '2') {
        residenceProofImage = locations?.residenceProofImage[0] || '';
        const parsedBankDetails = parseJSON(bankDetails);
        finalData = {
          userId,
          residenceProofImage,
          bankDetails: parsedBankDetails,
        };
      } else {
        personalImage = locations?.personalImage[0] || '';

        finalData = {
          userId,
          personalImage,
        };
      }
    }

    if (user?.type === 'Seller') {
      const { _id } = await KYC.findOneAndUpdate({ userId }, { $set: { userId, ...finalData, isBusiness: !user.isIndividualSeller } }, { upsert: true, new: true });

      await USER.findOneAndUpdate({ _id: userId }, { $set: { isKycRequested: true, kyc: _id, kycRequestLevel: 3 } });
    } else {
      await KYC.findOneAndUpdate({ userId }, { $set: { userId, ...finalData } }, { upsert: true });
      await USER.findOneAndUpdate({ _id: userId }, { $set: { isKycRequested: true, kycRequestLevel } });
    }
    const kyl = user?.type === 'seller' ? '3' : kycRequestLevel;

    const notificationData = {
      actionType: 'kyc_request_received',
      title: 'KYC Request Received!',
      message: [`${user.username} has requested for KYC level ${kyl}.`],
    };

    await createNotification([], notificationData, ['SUPER_ADMIN'], {
      adminNotification: true,
    });
    return res.status(200).json({ success: true, message: 'KYC Requested Successfully!' });
  },

  approveKyc: async (req, res) => {
    const { id } = req.params;

    if (!id) return res.status(404).json({ success: false, message: 'User Id is Missing or Invalid!' });

    const user = await USER.findOne({ _id: id });
    if (!user) return res.status(404).json({ success: true, message: 'User not Found!' });

    await USER.findOneAndUpdate({ _id: id }, { $set: { kycLevel: user?.kycRequestLevel, isKycRequested: false, kycRequestLevel: null } });
    await KYC.findOneAndUpdate({ userId: id }, { $set: { verificationStatus: 'approved', declineReason: '' } });

    const notificationData = {
      actionType: 'product_approved',
      title: 'KYC Approval Notification!',
      message: [`Your request for KYC level ${user?.kycRequestLevel} has been approved!`],
    };

    await createNotification([id], notificationData, [], {
      [`${user.type.toLowerCase()}Notification`]: true,
    });
    return res.status(200).json({ success: true, message: 'KYC Approved Successfully!' });
  },

  declineKyc: async (req, res) => {
    const { id } = req.params;
    const { declineReason } = req.body;

    if (!id) return res.status(404).json({ success: false, message: 'User Id is Missing or Invalid!' });

    const user = await USER.findOne({ _id: id });
    if (!user) return res.status(404).json({ success: true, message: 'User not Found!' });

    const reqKyc = user?.kycRequestLevel;

    await KYC.findOneAndUpdate({ userId: id }, { $set: { verificationStatus: 'rejected', declineReason } });
    await USER.findOneAndUpdate({ _id: id }, { $set: { isKycRequested: false, kycRequestLevel: null } });

    const notificationData = {
      actionType: 'kyc_rejected',
      title: 'KYC Request Declined!',
      message: [`Your request for KYC Level ${reqKyc} has been rejected. Reason: ${declineReason}`],
    };

    await createNotification([id], notificationData, [], {
      [`${user.type.toLowerCase()}Notification`]: true,
    });
    return res.status(200).json({ success: true, message: 'KYC Declined Successfully!' });
  },

  getKycInfo: async (req, res) => {
    const { id } = req.params;

    const user = await USER.findOne({ _id: id });
    const kyc = await KYC.findOne({ userId: id });

    let images = [];
    let finalKycData = {};

    if (user?.type !== 'Buyer') {
      const images = [];

      const passportImageFrontKey = await extractKey(kyc?.passportImageFront);
      const passportImageBackKey = await extractKey(kyc?.passportImageBack);
      const residenceProofImageKey = await extractKey(kyc?.residenceProofImage);
      const companyDocumentImageKey = await extractKey(kyc?.companyDocumentImage);
      const personalImageKey = await extractKey(kyc?.personalImage);

      if (passportImageFrontKey) {
        const passportImageFrontUrl = await generatePreSignedUrl(passportImageFrontKey);
        images.push({ fieldName: 'Passport Image (Front)', url: passportImageFrontUrl });
      }
      if (passportImageBackKey) {
        const passportImageBackUrl = await generatePreSignedUrl(passportImageBackKey);
        images.push({ fieldName: 'Passport Image (Back)', url: passportImageBackUrl });
      }
      if (residenceProofImageKey) {
        const residenceProofImageUrl = await generatePreSignedUrl(residenceProofImageKey);
        images.push({ fieldName: 'Residence Proof Image', url: residenceProofImageUrl });
      }
      if (personalImageKey) {
        const personalImageUrl = await generatePreSignedUrl(personalImageKey);
        images.push({ fieldName: 'Facial Image', url: personalImageUrl });
      }

      if (companyDocumentImageKey) {
        const companyDocumentImageUrl = await generatePreSignedUrl(companyDocumentImageKey);
        images.push({ fieldName: 'Company Document Image', url: companyDocumentImageUrl });
      }

      finalKycData.images = images;
      finalKycData.bankDetails = kyc.bankDetails;
    } else if (user?.kycRequestLevel === 1) {
      const passportImageFrontKey = await extractKey(kyc?.passportImageFront);
      const passportImageBackKey = await extractKey(kyc?.passportImageBack);
      images.push(await generatePreSignedUrl(passportImageFrontKey));
      images.push(await generatePreSignedUrl(passportImageBackKey));
      finalKycData.images = images;
    } else if (user?.kycRequestLevel === 2) {
      const residenceProofImageKey = await extractKey(kyc?.residenceProofImage);
      images.push(await generatePreSignedUrl(residenceProofImageKey));
      finalKycData.images = images;
      finalKycData.bankDetails = kyc.bankDetails;
    } else {
      const personalImageKey = await extractKey(kyc?.personalImage);
      images.push(await generatePreSignedUrl(personalImageKey));
      finalKycData.images = images;
    }

    return res.status(200).json({ success: true, message: 'KYC Info. Retrieved Successfully!', finalKycData });
  },
};
