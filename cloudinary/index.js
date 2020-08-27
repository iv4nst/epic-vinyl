const crypto = require('crypto');
const cloudinary = require('cloudinary');

cloudinary.config({
	cloud_name : 'dgmv2xcxy',
	api_key    : '223926587655665',
	api_secret : process.env.CLOUDINARY_SECRET
});
const cloudinaryStorage = require('multer-storage-cloudinary');
const storage = cloudinaryStorage({
	cloudinary,
	folder         : 'surf-shop',
	allowedFormats : [ 'jpeg', 'jpg', 'png' ],
	filename       : function(req, file, cb) {
		let buf = crypto.randomBytes(16);
		buf = buf.toString('hex');
		let uniqFileName = file.originalname.replace(/\.jpeg|\.jpg|\.png/gi, '');
		uniqFileName += buf;
		cb(undefined, uniqFileName);
	}
});

module.exports = {
	cloudinary,
	storage
};
