const express = require('express');
const router = express.Router();
const multer = require('multer');
const { storage } = require('../cloudinary');
const upload = multer({ storage });
const { asyncErrorHandler, isLoggedIn, isAuthor, searchAndFilterVinyls } = require('../middleware');
const { vinylIndex, vinylNew, vinylCreate, vinylShow, vinylEdit, vinylUpdate, vinylDestroy } = require('../controllers/vinyls');

/* GET vinyls index /vinyls */
router.get('/', asyncErrorHandler(searchAndFilterVinyls), asyncErrorHandler(vinylIndex));

/* GET vinyls new /vinyls/new */
router.get('/new', isLoggedIn, vinylNew);

/* POST vinyls create /vinyls */
router.post('/', isLoggedIn, upload.array('images', 4), asyncErrorHandler(vinylCreate));

/* GET vinyls show /vinyls/:id */
router.get('/:id', asyncErrorHandler(vinylShow));

/* GET vinyls edit /vinyls/:id/edit */
router.get('/:id/edit', isLoggedIn, asyncErrorHandler(isAuthor), vinylEdit);

/* PUT vinyls update /vinyls/:id */
router.put('/:id', isLoggedIn, asyncErrorHandler(isAuthor), upload.array('images', 4), asyncErrorHandler(vinylUpdate));

/* DELETE vinyls destroy /vinyls/:id */
router.delete('/:id', isLoggedIn, asyncErrorHandler(isAuthor), asyncErrorHandler(vinylDestroy));

module.exports = router;
