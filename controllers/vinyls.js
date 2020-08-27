const Vinyl = require('../models/vinyl');
const mbxGeocoding = require('@mapbox/mapbox-sdk/services/geocoding');
const mapBoxToken = process.env.MAPBOX_TOKEN;
const geocodingClient = mbxGeocoding({ accessToken: mapBoxToken });
const { cloudinary } = require('../cloudinary');

module.exports = {
	// Vinyls Index
	async vinylIndex(req, res, next) {
		const { dbQuery } = res.locals;
		delete res.locals.dbQuery;
		let vinyls = await Vinyl.paginate(dbQuery, {
			page  : req.query.page || 1,
			limit : 10,
			sort  : '-_id' // descending (when sorting by _id -> sorting by the date created)
		});
		vinyls.page = Number(vinyls.page);
		if (!vinyls.docs.length && res.locals.query) {
			res.locals.error = 'No results match that query.';
		}
		res.render('vinyls/index', {
			vinyls,
			mapBoxToken,
			title       : 'Vinyls Index'
		});
	},

	// Vinyls New
	vinylsNew(req, res, next) {
		res.render('vinyls/new');
	},

	// Vinyls Create
	async vinylCreate(req, res, next) {
		req.body.vinyl.images = [];
		for (const file of req.files) {
			req.body.vinyl.images.push({
				url       : file.secure_url,
				public_id : file.public_id
			});
		}
		let response = await geocodingClient
			.forwardGeocode({
				query : req.body.vinyl.location,
				limit : 1
			})
			.send();
		req.body.vinyl.geometry = response.body.features[0].geometry;
		req.body.vinyl.author = req.user._id;
		let vinyl = new Vinyl(req.body.vinyl);
		vinyl.properties.description = `<strong><a href="/vinyls/${vinyl._id}">${vinyl.title}</a></strong><p>${vinyl.location}</p><p>${vinyl.description.substring(
			0,
			20
		)}...</p>`;
		vinyl.save();
		req.session.success = 'Vinyl created successfully!';
		res.redirect(`/vinyls/${vinyl.id}`);
	},

	// Vinyls Show
	async vinylShow(req, res, next) {
		let vinyl = await (await Vinyl.findById(req.params.id)).populate({
			path     : 'reviews',
			options  : { sort: { _id: -1 } }, // newest ones at the top
			populate : {
				path  : 'author',
				model : 'User'
			}
		});
		// const floorRating = vinyl.calculateAvgRating();
		const floorRating = vinyl.avgRating;
		res.render('vinyls/show', { vinyl, mapBoxToken, floorRating, title: 'Vinyls Show' });
	},

	// Vinyls Edit
	vinylEdit(req, res, next) {
		res.render('vinyls/edit');
	},

	// Vinyls Update
	async vinylUpdate(req, res, next) {
		// destructure vinyl from res.locals
		const { vinyl } = res.locals;
		// check if there's any images for deletion
		if (req.body.deleteImages && req.body.deleteImages.length) {
			// assign deleteImages from req.body to its own variable
			let deleteImages = req.body.deleteImages;
			// loop over deleteImages
			for (const public_id of deleteImages) {
				// delete images from cloudinary
				await cloudinary.v2.uploader.destroy(public_id);
				// delete image from vinyl.images
				for (const image of vinyl.images) {
					if (image.public_id === public_id) {
						let index = vinyl.images.indexOf(image);
						vinyl.images.splice(index, 1);
					}
				}
			}
		}
		// check if there are any new images for upload
		if (req.files) {
			// upload images
			for (const file of req.files) {
				// add images to vinyl.images array
				vinyl.images.push({
					url       : file.secure_url,
					public_id : file.public_id
				});
			}
		}
		// check if location was updated
		if (req.body.vinyl.location !== vinyl.location) {
			let response = await geocodingClient
				.forwardGeocode({
					query : req.body.vinyl.location,
					limit : 1
				})
				.send();
			vinyl.geometry = response.body.features[0].geometry;
			vinyl.location = req.body.vinyl.location;
		}

		// update the vinyl with any new properties
		vinyl.title = req.body.vinyl.title;
		vinyl.description = req.body.vinyl.description;
		vinyl.price = req.body.vinyl.price;
		vinyl.properties.description = `<strong><a href="/vinyls/${vinyl._id}">${vinyl.title}</a></strong><p>${vinyl.location}</p><p>${vinyl.description.substring(
			0,
			20
		)}...</p>`;
		// save the updated vinyl into the db
		await vinyl.save();
		// redirect to show page
		res.redirect(`/vinyls/${vinyl.id}`);
	},

	// Vinyls Destroy
	async vinylDestroy(req, res, next) {
		const { vinyl } = res.locals;
		for (const image of vinyl.images) {
			await cloudinary.v2.uploader.destroy(image.public_id);
		}
		await vinyl.remove();
		req.session.success = 'Vinyl deleted successfully!';
		res.redirect('/vinyls');
	}
};
