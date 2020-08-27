const User = require('../models/user');
const Vinyl = require('../models/vinyl');
const passport = require('passport');
const mapBoxToken = process.env.MAPBOX_TOKEN;
const util = require('util');
const { cloudinary } = require('../cloudinary');
const { deleteProfileImage } = require('../middleware');
const crypto = require('crypto');
const sgMail = require('@sendgrid/mail');

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

module.exports = {
	// GET /
	async landingPage(req, res, next) {
		const vinyls = await Vinyl.find({}).sort('-_id').exec();
		const recentVinyls = vinyls.slice(0, 3);
		res.render('index', { vinyls, mapBoxToken, recentVinyls, title: 'Epic-Vinyl - Home' });
	},
	// async landingPage(req, res, next) {
	// 	res.render('landing');
	// },

	// GET /register
	getRegister(req, res, next) {
		res.render('register', { title: 'Register', username: '', email: '' });
	},

	// POST /register
	async postRegister(req, res, next) {
		try {
			// if image is uploaded (if it was not, we don't have access to secure_url and public_id)
			// also we let mongodb do it's thing for setting default image (models/user.js)
			if (req.file) {
				const { secure_url, public_id } = req.file;
				req.body.image = { secure_url, public_id };
			}
			const user = await User.register(new User(req.body), req.body.password);
			req.login(user, function(err) {
				if (err) return next(err);
				req.session.success = `Welcome to Epic-Vinyl, ${user.username}!`;
				res.redirect('/');
			});
		} catch (err) {
			deleteProfileImage(req);
			const { username, email } = req.body;
			let error = err.message;
			// hvatanje greske ako email vec postoji
			if (error.includes('duplicate') && error.includes('index: email_1 dup key')) {
				error = 'A user with the given email is already registered';
			}
			res.render('register', { title: 'Register', username, email, error });
		}
	},

	// GET /login
	getLogin(req, res, next) {
		// ako je korisnik vec ulogovan, ne moze da ode opet na /login -> redirect na home page
		if (req.isAuthenticated()) return res.redirect('/');
		// (ako je korisnik hteo da ostavi review, a nije ulogovan, kad se uloguje vratice se na stranicu za review)
		if (req.query.returnTo) req.session.redirectTo = req.headers.referer;
		// u suprotnom moze da ode na login
		res.render('login', { title: 'Login' });
	},

	// POST /login
	async postLogin(req, res, next) {
		const { username, password } = req.body;
		// vraca funkciju, i odmah je pozivamo i prosledjujemo username i password, i daje nam ili user objekat ili error
		const { user, error } = await User.authenticate()(username, password);
		// ako nema korisnika i ima greske, vraca gresku
		if (!user && error) return next(error);
		// ako ima korisnika, uloguj ga i napravi sesiju za njega
		req.login(user, function(err) {
			// ako dodje do greske, vraca gresku
			if (err) return next(err);

			// u suprotnom ovo ostalo:
			req.session.success = `Welcome to Epic-Vinyl, ${username}`;
			// req.session.redirectTo -> cuva req.originalUrl
			// vise nemamo pristup req.originalUrl, ali sesija ostaje dok je ne izbrisemo
			// ovde izvlacimo redirectTo iz sesije i dodeljujemo je novoj promenljivoj
			// i ako ne postoji, dodeljujemo joj '/' (home page)
			// brisemo req.session.redirectTo da ne zauzima memoriju
			// i na kraju redirect ili na taj url iz sesije, ili na home page
			const redirectUrl = req.session.redirectTo || '/';
			delete req.session.redirectTo;
			res.redirect(redirectUrl);
		});
	},

	// GET /logout
	getLogout(req, res, next) {
		req.logout();
		res.redirect('/');
	},

	// GET /profile
	async getProfile(req, res, next) {
		// find all vinyls where the author equals logged in user
		const vinyls = await Vinyl.find().where('author').equals(req.user._id).limit(10).exec();
		res.render('profile', { vinyls });
	},

	// UPDATE /profile
	async updateProfile(req, res, next) {
		// destructure username and email from req.body
		const { username, email } = req.body;
		// destructure user object from res.locals
		const { user } = res.locals;

		// check if username or email need to be updated
		if (username) user.username = username;
		if (email) user.email = email;
		// check if there is an image
		if (req.file) {
			if (user.image.public_id) await cloudinary.v2.uploader.destroy(user.image.public_id);
			const { secure_url, public_id } = req.file;
			user.image = { secure_url, public_id };
		}
		// save the updated user to the database
		await user.save();

		// uloguj korisnika sa novim username/password
		// req je kontekst (this) koji se prosledjuje u req.login() i tako login ima pristup req-u i svemu sto mu treba da uloguje korisnika
		// promsify req.login
		const login = util.promisify(req.login.bind(req));
		// log the user back in with new info
		await login(user);
		// redirect to /profile with a success flash message
		req.session.success = 'Profile successfully updated!';
		res.redirect('/profile');
	},

	getForgotPw(req, res, next) {
		res.render('users/forgot');
	},

	async putForgotPw(req, res, next) {
		const token = await crypto.randomBytes(20).toString('hex');
		const { email } = req.body;
		const user = await User.findOne({ email });
		if (!user) {
			req.session.error = 'No account with that email.';
			return res.redirect('/forgot-password');
		}

		user.resetPasswordToken = token;
		user.resetPasswordExpires = Date.now() + 3600000;

		await user.save();

		const msg = {
			to      : email,
			from    : 'Epic-Vinyl Admin <your@email.com>',
			subject : 'Epic-Vinyl - Forgot Password / Reset',
			text    : `You are receiving this because you (or someone else)
			have requested the reset of the password for your account.
			Please click on the following link, or copy and paste it
			into your browser to complete the process:
			http://${req.headers.host}/reset/${token}
			If you did not request this, please ignore this email and
			your password will remain unchanged.`.replace(/			/g, '')
			// html: '<strong>and easy to do anywhere, even with Node.js</strong>',
		};

		await sgMail.send(msg);

		req.session.success = `An email has been sent to ${email} with further instructions.`;
		res.redirect('/forgot-password');
	},

	async getReset(req, res, next) {
		const { token } = req.params;
		const user = await User.findOne({
			resetPasswordToken   : token,
			resetPasswordExpires : { $gt: Date.now() }
		});

		if (!user) {
			req.session.error = 'Password reset token is invalid or has expired.';
			return res.redirect('/forgot-password');
		}

		res.render('users/reset', { token });
	},

	async putReset(req, res, next) {
		const { token } = req.params;
		const user = await User.findOne({
			resetPasswordToken   : token,
			resetPasswordExpires : { $gt: Date.now() }
		});

		if (!user) {
			req.session.error = 'Password reset token is invalid or has expired.';
			return res.redirect('/forgot-password');
		}

		if (req.body.password === req.body.confirm) {
			await user.setPassword(req.body.password);
			user.resetPasswordToken = null;
			user.resetPasswordExpires = null;
			await user.save();
			const login = util.promisify(req.login.bind(req));
			await login(user);
		}
		else {
			req.session.error = 'Passwords do not match.';
			return res.redirect(`/reset/${token}`);
		}

		const msg = {
			to      : user.email,
			from    : 'Epic-Vinyl Admin <your@email.com>',
			subject : 'Epic-Vinyl - Password Changed',
			text    : `Hello,
			This email is to confirm that the password for your account has just been changed.
			If you did not make this change, please hit reply and notify us at once.`.replace(/			/g, '')
		};

		await sgMail.send(msg);

		req.session.success = 'Password successfully updated!';
		res.redirect('/');
	}
};
