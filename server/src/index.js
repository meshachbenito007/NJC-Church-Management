const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

require('dotenv').config();

const pool = require('./db');

const {
  requestOtp,
  verifyOtp
} = require('./services/otp.service');

const {
  uploadFile
} = require('./services/google-drive.service');


const app = express();


/* ==========================================================================
   PATHS
========================================================================== */

const TMP_DIR = path.join(__dirname, '../tmp');

if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, {
    recursive: true
  });
}


/* ==========================================================================
   UPLOAD CONFIGURATION
========================================================================== */

const upload = multer({
  dest: TMP_DIR
});


const sermonUpload = multer({
  dest: TMP_DIR,

  limits: {
    files: 2,
    fileSize: 500 * 1024 * 1024
  }
});


const audioUpload = multer({
  dest: TMP_DIR,
  limits: {
    files: 1,
    fileSize: 500 * 1024 * 1024
  },
  fileFilter(req, file, cb) {
    const name = String(file.originalname || '').toLowerCase();
    const valid =
      file.mimetype === 'audio/mpeg' ||
      file.mimetype === 'audio/mp3' ||
      name.endsWith('.mp3');
    if (valid) return cb(null, true);
    cb(new Error(`Unsupported audio file: ${file.originalname}`));
  }
});


const mediaUpload = multer({
  dest: TMP_DIR,

  limits: {
    files: 100,
    fileSize: 500 * 1024 * 1024
  },

  fileFilter(req, file, cb) {

    const name = String(
      file.originalname || ''
    ).toLowerCase();

    const imageExtensions = [
      '.jpg',
      '.jpeg',
      '.png',
      '.webp',
      '.gif'
    ];

    const videoExtensions = [
      '.mp4',
      '.webm',
      '.mov',
      '.m4v'
    ];

    const validImage =
      imageExtensions.some(
        ext => name.endsWith(ext)
      );

    const validVideo =
      videoExtensions.some(
        ext => name.endsWith(ext)
      );

    if (validImage || validVideo) {
      return cb(null, true);
    }

    cb(
      new Error(
        `Unsupported gallery file: ${file.originalname}`
      )
    );
  }
});


/* ==========================================================================
   MIDDLEWARE
========================================================================== */

app.use(cors());

app.use(
  express.json({
    limit: '5mb'
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: '5mb'
  })
);


/* ==========================================================================
   GOOGLE DRIVE LOCAL FOLDER
========================================================================== */

const DRIVE_FOLDER =
  process.env.GOOGLE_DRIVE_LOCAL_FOLDER ||
  'G:/My Drive/Sermon';


if (fs.existsSync(DRIVE_FOLDER)) {

  app.use(
    '/sermon-files',
    express.static(
      DRIVE_FOLDER,
      {
        fallthrough: true
      }
    )
  );

} else {

  console.warn(
    'Google Drive folder not found:',
    DRIVE_FOLDER
  );

}


/* ==========================================================================
   HELPERS
========================================================================== */

const secret = () =>
  process.env.JWT_SECRET ||
  'dev-secret-change-me';


const publicBaseUrl = () =>
  process.env.PUBLIC_BASE_URL ||
  `http://localhost:${process.env.PORT || 3000}`;


const sign = payload =>
  jwt.sign(
    payload,
    secret(),
    {
      expiresIn: '7d'
    }
  );


const safe = async (
  sql,
  args = []
) => {

  const [
    rows
  ] = await pool.query(
    sql,
    args
  );

  return rows;
};


/* ==========================================================================
   MEDIA URL
========================================================================== */

function localMediaUrl(filename) {

  if (!filename) {
    return null;
  }

  return (
    `${publicBaseUrl()}` +
    `/sermon-files/` +
    encodeURIComponent(filename)
  );
}


function sermonFileUrl(fileName) {
  return localMediaUrl(fileName);
}


function isVideoFile(filename) {

  return /\.(mp4|webm|mov|m4v)$/i.test(
    filename || ''
  );

}


/* ==========================================================================
   CONTENT MEDIA ENRICHMENT
========================================================================== */

function enrichContent(
  table,
  row
) {

  if (table === 'sermons') {

    return {

      ...row,

      image_url:
        localMediaUrl(
          row.image_file_id ||
          row.file_id
        ),

      audio_url:
        localMediaUrl(
          row.audio_file_id ||
          row.file_id
        )

    };

  }


  if (table === 'worship_songs') {

    return {

      ...row,

      audio_url:
        localMediaUrl(
          row.audio_file_id
        )

    };

  }


  return row;
}


/* ==========================================================================
   GALLERY HELPERS
========================================================================== */

function enrichGalleryAlbum(album) {

  return {

    ...album,

    cover_url:
      album.cover_file_id
        ? localMediaUrl(
            album.cover_file_id
          )
        : null,

    image_count:
      Number(
        album.image_count || 0
      ),

    video_count:
      Number(
        album.video_count || 0
      ),

    media_count:
      Number(
        album.media_count || 0
      )

  };

}


function enrichGalleryMedia(media) {

  return {

    ...media,

    media_url:
      localMediaUrl(
        media.file_id
      )

  };

}


/* ==========================================================================
   AUTHENTICATION
========================================================================== */

function auth(
  req,
  res,
  next
) {

  try {

    const header =
      req.headers.authorization ||
      '';

    const authToken =
      header.startsWith('Bearer ')
        ? header.slice(7)
        : header;

    req.user =
      jwt.verify(
        authToken,
        secret()
      );

    next();

  } catch {

    res.status(401).json({
      message: 'Unauthorized'
    });

  }

}


/* ==========================================================================
   ADMIN PROTECTION
========================================================================== */

function admin(
  req,
  res,
  next
) {

  if (
    req.user?.role === 'member'
  ) {

    return res.status(403).json({
      message: 'Admin only'
    });

  }

  next();

}


/* ==========================================================================
   VALIDATION
========================================================================== */

function validateSermonImage(file) {

  if (!file) {
    throw new Error(
      'Sermon image is required'
    );
  }

  if (
    !file.mimetype ||
    !file.mimetype.startsWith('image/')
  ) {

    throw new Error(
      'Sermon image must be an image file'
    );

  }

}


function validateSermonAudio(file) {

  if (!file) {

    throw new Error(
      'MP3 audio file is required'
    );

  }

  const validMime =
    file.mimetype === 'audio/mpeg' ||
    file.mimetype === 'audio/mp3' ||
    file.originalname
      .toLowerCase()
      .endsWith('.mp3');

  if (!validMime) {

    throw new Error(
      'Only MP3 audio files are allowed'
    );

  }

}


function validateSongAudio(file) {

  if (!file) {

    throw new Error(
      'MP3 audio file is required'
    );

  }

  const valid =
    file.mimetype === 'audio/mpeg' ||
    file.mimetype === 'audio/mp3' ||
    file.originalname
      .toLowerCase()
      .endsWith('.mp3');

  if (!valid) {

    throw new Error(
      'Only MP3 audio files are allowed'
    );

  }

}


function validateGalleryImage(file) {

  if (!file) {
    return;
  }

  if (
    !file.mimetype ||
    !file.mimetype.startsWith('image/')
  ) {

    throw new Error(
      'Gallery image must be an image file'
    );

  }

}


function validateGalleryVideo(file) {

  if (!file) {
    return;
  }

  const valid =
    /\.(mp4|webm|mov|m4v)$/i.test(
      file.originalname || ''
    );

  if (!valid) {

    throw new Error(
      'Gallery video must be MP4, WEBM, MOV or M4V'
    );

  }

}


/* ==========================================================================
   HEALTH
========================================================================== */

app.get(
  '/api/health',
  (req, res) => {

    res.json({
      ok: true,
      service: 'church-management-api'
    });

  }
);


/* ==========================================================================
   COMBINED MOBILE + OTP AUTH
========================================================================== */

app.post(
  '/api/auth/request-otp',
  async (req, res) => {

    try {

      const mobile =
        String(req.body.mobile || '').trim();

      if (!mobile) {
        return res.status(400).json({
          message: 'Mobile required'
        });
      }

      const members = await safe(
        `
          SELECT id
          FROM members
          WHERE mobile=?
            AND status='active'
          LIMIT 1
        `,
        [mobile]
      );

      const admins = await safe(
        `
          SELECT id
          FROM admins
          WHERE mobile=?
          LIMIT 1
        `,
        [mobile]
      );

      if (!members.length && !admins.length) {
        return res.status(404).json({
          message: 'Mobile number is not registered'
        });
      }

      await requestOtp(mobile);

      res.json({
        message: 'OTP sent'
      });

    } catch (e) {

     console.error(
  'POST /api/auth/request-otp error:',
  e.message
);

      res.status(500).json({
        message: e.message
      });

    }

  }
);


app.post(
  '/api/auth/verify-otp',
  async (req, res) => {

    try {

      const mobile =
        String(req.body.mobile || '').trim();

      const otp =
        String(req.body.otp || '').trim();

      if (!mobile || !otp) {
        return res.status(400).json({
          message: 'Mobile and OTP required'
        });
      }

      if (!(await verifyOtp(mobile, otp))) {
        return res.status(400).json({
          message: 'Invalid or expired OTP'
        });
      }

      const members = await safe(
        `
          SELECT *
          FROM members
          WHERE mobile=?
            AND status='active'
          LIMIT 1
        `,
        [mobile]
      );

      const admins = await safe(
        `
          SELECT *
          FROM admins
          WHERE mobile=?
          LIMIT 1
        `,
        [mobile]
      );

      const hasMember =
        members.length > 0;

      const hasAdmin =
        admins.length > 0;

      if (!hasMember && !hasAdmin) {
        return res.status(404).json({
          message: 'No active account found'
        });
      }

      /*
       * The same mobile number exists in both tables.
       * Do not issue an account token yet.
       * Ask the user to choose Member or Admin.
       */

      if (hasMember && hasAdmin) {

        const selectionToken =
          jwt.sign(
            {
              mobile,
              purpose: 'role-selection'
            },
            secret(),
            {
              expiresIn: '10m'
            }
          );

        return res.json({

          requiresRoleSelection: true,

          selectionToken,

          accounts: [
            {
              role: 'member',
              name:
                members[0].full_name ||
                'Member'
            },
            {
              role: 'admin',
              name:
                admins[0].username ||
                admins[0].name ||
                'Admin'
            }
          ]

        });

      }

      /*
       * Member only
       */

      if (hasMember) {

        return res.json({

          requiresRoleSelection: false,

          role: 'member',

          token:
            sign({
              id: members[0].id,
              role: 'member'
            }),

          member:
            members[0]

        });

      }

      /*
       * Admin only
       */

      return res.json({

        requiresRoleSelection: false,

        role: 'admin',

        token:
          sign({
            id: admins[0].id,
            role:
              admins[0].role ||
              'admin'
          }),

        admin:
          admins[0]

      });

    } catch (e) {

      console.error(
        'POST /api/auth/verify-otp error:',
        e
      );

      res.status(500).json({
        message: e.message
      });

    }

  }
);


/* ==========================================================================
   SELECT MEMBER OR ADMIN AFTER OTP
========================================================================== */

app.post(
  '/api/auth/select-role',
  async (req, res) => {

    try {

      const {
        selectionToken,
        role
      } = req.body;

      if (!selectionToken || !role) {
        return res.status(400).json({
          message:
            'Selection token and role required'
        });
      }

      if (
        role !== 'member' &&
        role !== 'admin'
      ) {
        return res.status(400).json({
          message: 'Invalid role'
        });
      }

      let selection;

      try {

        selection =
          jwt.verify(
            selectionToken,
            secret()
          );

      } catch {

        return res.status(401).json({
          message:
            'Selection session expired'
        });

      }

      if (
        selection.purpose !==
        'role-selection'
      ) {
        return res.status(401).json({
          message:
            'Invalid selection session'
        });
      }

      const mobile =
        selection.mobile;

      /*
       * Member
       */

      if (role === 'member') {

        const rows =
          await safe(
            `
              SELECT *
              FROM members
              WHERE mobile=?
                AND status='active'
              LIMIT 1
            `,
            [mobile]
          );

        if (!rows.length) {
          return res.status(404).json({
            message:
              'Member account not found'
          });
        }

        return res.json({

          role: 'member',

          token:
            sign({
              id: rows[0].id,
              role: 'member'
            }),

          member:
            rows[0]

        });

      }

      /*
       * Admin
       */

      const rows =
        await safe(
          `
            SELECT *
            FROM admins
            WHERE mobile=?
            LIMIT 1
          `,
          [mobile]
        );

      if (!rows.length) {
        return res.status(404).json({
          message:
            'Admin account not found'
        });
      }

      return res.json({

        role: 'admin',

        token:
          sign({
            id: rows[0].id,
            role:
              rows[0].role ||
              'admin'
          }),

        admin:
          rows[0]

      });

    } catch (e) {

      console.error(
        'POST /api/auth/select-role error:',
        e
      );

      res.status(500).json({
        message: e.message
      });

    }

  }
);


/* ==========================================================================
   LEGACY MEMBER REGISTRATION
========================================================================== */

app.post(
  '/api/auth/member/register',
  async (
    req,
    res
  ) => {

    const m =
      req.body;

    if (
      !m.full_name ||
      !m.mobile
    ) {

      return res.status(400).json({
        message:
          'Name and mobile required'
      });

    }

    const exists =
      await safe(
        `
          SELECT id
          FROM members
          WHERE mobile=?
        `,
        [m.mobile]
      );

    if (exists.length) {

      return res.status(409).json({
        message:
          'Mobile already registered'
      });

    }

    const id =
      'NJC-' +
      Date.now()
        .toString()
        .slice(-8);

    const x =
      await safe(
        `
          INSERT INTO members
          (
            member_id,
            full_name,
            mobile,
            dob,
            sex,
            address,
            house_no,
            street,
            area,
            city,
            district,
            state,
            pin,
            latitude,
            longitude,
            map_url,
            status
          )
          VALUES
          (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `,
        [
          id,
          m.full_name,
          m.mobile,
          m.dob || null,
          m.sex || null,
          m.address || null,
          m.house_no || null,
          m.street || null,
          m.area || null,
          m.city || null,
          m.district || null,
          m.state || null,
          m.pin || null,
          m.latitude || null,
          m.longitude || null,
          m.map_url || null,
          'active'
        ]
      );

    res.json({

      id:
        x.insertId,

      member_id:
        id

    });

  }
);


/* ==========================================================================
   LEGACY ADMIN LOGIN
   Mobile + OTP is now the primary admin authentication.
   This endpoint is retained only so old clients receive a clear message.
========================================================================== */

app.post(
  '/api/auth/admin/login',
  async (
    req,
    res
  ) => {

    return res.status(410).json({
      message:
        'Admin username/password login has been replaced by mobile OTP login.'
    });

  }
);


/* ==========================================================================
   DASHBOARD
========================================================================== */
app.get(
  '/api/dashboard',
  auth,
  admin,
  async (req, res) => {
    try {
      const [
        members,
        events,
        prayers,
        expenses,
        settings
      ] = await Promise.all([
        safe(`
          SELECT COUNT(*) AS total
          FROM members
          WHERE status = 'active'
        `),
        safe(`
          SELECT COUNT(*) AS total
          FROM events
          WHERE status = 'published'
        `),
        safe(`
          SELECT COUNT(*) AS total
          FROM prayer_requests
          WHERE status <> 'completed'
        `),
        safe(`
          SELECT COALESCE(SUM(amount), 0) AS total
          FROM expenses
        `),
        safe(`
          SELECT starting_balance
          FROM finance_settings
          LIMIT 1
        `)
      ]);

      const totalExpenses =
        Number(expenses[0]?.total || 0);

      const startingBalance =
        Number(settings[0]?.starting_balance || 0);

      res.json({
        members: Number(members[0]?.total || 0),
        events: Number(events[0]?.total || 0),
        pending_prayers: Number(prayers[0]?.total || 0),
        total_expenses: totalExpenses,
        current_balance: startingBalance - totalExpenses
      });
    } catch (error) {
      console.error('GET /api/dashboard error:', error);

      res.status(500).json({
        message: error.message
      });
    }
  }
);

/* ==========================================================================
   MEMBERS
========================================================================== */

app.get(
  '/api/members',
  auth,
  admin,
  async (
    req,
    res
  ) => {

    let sql =
      'SELECT *, name AS full_name, date_of_birth AS dob, gender AS sex FROM members WHERE 1=1';

    const args = [];

    if (req.query.search) {

      sql += `
        AND (
          full_name LIKE ?
          OR mobile LIKE ?
          OR member_id LIKE ?
          OR area LIKE ?
          OR city LIKE ?
        )
      `;

      const search =
        `%${req.query.search}%`;

      args.push(
        search,
        search,
        search,
        search,
        search
      );

    }

    if (req.query.status) {

      sql +=
        ' AND status=?';

      args.push(
        req.query.status
      );

    }

    sql +=
      ' ORDER BY name';

    try {

      res.json(
        await safe(
          sql,
          args
        )
      );

    } catch (e) {

      res.status(500).json({
        message: e.message
      });

    }

  }
);


app.post(
  '/api/members',
  auth,
  admin,
  async (
    req,
    res
  ) => {

    try {

      const m =
        req.body;

      const id =
        m.member_id ||
        (
          'NJC-' +
          Date.now()
            .toString()
            .slice(-8)
        );

      const x =
        await safe(
          `
            INSERT INTO members
            (
              member_id,
              full_name,
              mobile,
              dob,
              sex,
              address,
              house_no,
              street,
              area,
              city,
              district,
              state,
              pin,
              latitude,
              longitude,
              map_url,
              status
            )
            VALUES
            (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
          `,
          [
            id,
            m.full_name,
            m.mobile || null,
            m.dob || null,
            m.sex || null,
            m.address || null,
            m.house_no || null,
            m.street || null,
            m.area || null,
            m.city || null,
            m.district || null,
            m.state || null,
            m.pin || null,
            m.latitude || null,
            m.longitude || null,
            m.map_url || null,
            m.status || 'active'
          ]
        );

      res.json({
        id: x.insertId,
        member_id: id
      });

    } catch (e) {

      res.status(500).json({
        message: e.message
      });

    }

  }
);


app.put(
  '/api/members/:id',
  auth,
  admin,
  async (
    req,
    res
  ) => {

    try {

      const m =
        req.body;

      await safe(
        `
          UPDATE members SET

            full_name=?,
            mobile=?,
            dob=?,
            sex=?,
            address=?,
            house_no=?,
            street=?,
            area=?,
            city=?,
            district=?,
            state=?,
            pin=?,
            latitude=?,
            longitude=?,
            map_url=?,
            status=?,
            ministry=?,
            notes=?

          WHERE id=?
        `,
        [
          m.full_name,
          m.mobile,
          m.dob || null,
          m.sex || null,
          m.address || null,
          m.house_no || null,
          m.street || null,
          m.area || null,
          m.city || null,
          m.district || null,
          m.state || null,
          m.pin || null,
          m.latitude || null,
          m.longitude || null,
          m.map_url || null,
          m.status || 'active',
          m.ministry || null,
          m.notes || null,
          req.params.id
        ]
      );

      res.json({
        ok: true
      });

    } catch (e) {

      res.status(500).json({
        message: e.message
      });

    }

  }
);


app.delete(
  '/api/members/:id',
  auth,
  admin,
  async (
    req,
    res
  ) => {

    try {

      await safe(
        `
          UPDATE members
          SET status="inactive"
          WHERE id=?
        `,
        [req.params.id]
      );

      res.json({
        ok: true
      });

    } catch (e) {

      res.status(500).json({
        message: e.message
      });

    }

  }
);


/* ==========================================================================
   CONTENT CONFIGURATION
========================================================================== */

const contentConfig = {

  announcements: [
    'title',
    'body',
    'status'
  ],

  events: [
    'title',
    'event_date',
    'location',
    'description',
    'speaker',
    'banner_file_id',
    'status'
  ],

  bible_verses: [
    'reference_name',
    'verse_text',
    'status'
  ],

  sermons: [
    'title',
    'speaker',
    'sermon_date',
    'description',
    'file_id',
    'audio_file_id',
    'image_file_id',
    'status'
  ],

  worship_songs: [
    'title',
    'artist',
    'lyrics',
    'audio_file_id',
    'status'
  ],

  ministries: [
    'name',
    'description',
    'leader',
    'status'
  ],

  notifications: [
    'title',
    'body',
    'target_group',
    'status'
  ],

  church_information: [
    'title',
    'body',
    'phone',
    'email',
    'address',
    'website',
    'map_url',
    'status'
  ],

  service_schedule: [
    'service_name',
    'day_of_week',
    'start_time',
    'end_time',
    'location',
    'description',
    'status'
  ]

};


const contentTables =
  Object.keys(
    contentConfig
  );


function pickFields(
  table,
  body
) {

  return contentConfig[table].filter(
    key =>
      Object.prototype.hasOwnProperty.call(
        body,
        key
      )
  );

}


/* ==========================================================================
   PAGINATED PUBLIC SERMONS
   IMPORTANT:
   This route MUST appear before the generic content routes.
========================================================================== */

app.get(
  '/api/sermons',
  async (
    req,
    res
  ) => {

    try {

      const page =
        Math.max(
          1,
          Number(req.query.page) || 1
        );

      const limit =
        Math.min(
          50,
          Math.max(
            1,
            Number(req.query.limit) || 5
          )
        );

      const offset =
        (page - 1) * limit;

      const search =
        String(
          req.query.search || ''
        ).trim();

      const year =
        String(
          req.query.year || ''
        ).trim();

      const speaker =
        String(
          req.query.speaker || ''
        ).trim();


      let where =
        `WHERE status='published'`;

      const params = [];


      /* SEARCH */

      if (search) {

        where += `
          AND (
            title LIKE ?
            OR speaker LIKE ?
            OR description LIKE ?
          )
        `;

        const q =
          `%${search}%`;

        params.push(
          q,
          q,
          q
        );

      }


      /* YEAR */

      if (
        year &&
        year !== 'all'
      ) {

        const numericYear =
          Number(year);

        if (
          Number.isInteger(
            numericYear
          )
        ) {

          where +=
            ` AND YEAR(sermon_date)=?`;

          params.push(
            numericYear
          );

        }

      }


      /* SPEAKER */

      if (
        speaker &&
        speaker !== 'all'
      ) {

        where +=
          ` AND speaker=?`;

        params.push(
          speaker
        );

      }


      /* TOTAL */

      const countResult =
        await safe(
          `
            SELECT
              COUNT(*) AS total
            FROM sermons
            ${where}
          `,
          params
        );


      const total =
        Number(
          countResult[0]?.total || 0
        );


      /* DATA */

      const rows =
        await safe(
          `
            SELECT

              id,
              title,
              speaker,
              sermon_date,
              description,
              file_id,
              audio_file_id,
              image_file_id,
              status,
              created_at

            FROM sermons

            ${where}

            ORDER BY
              sermon_date DESC,
              id DESC

            LIMIT ?
            OFFSET ?
          `,
          [
            ...params,
            limit,
            offset
          ]
        );


      const sermons =
        rows.map(
          row => ({

            ...row,

            audio_url:
              row.audio_file_id
                ? sermonFileUrl(
                    row.audio_file_id
                  )
                : (
                    row.file_id
                      ? sermonFileUrl(
                          row.file_id
                        )
                      : null
                  ),

            image_url:
              row.image_file_id
                ? sermonFileUrl(
                    row.image_file_id
                  )
                : (
                    row.file_id
                      ? sermonFileUrl(
                          row.file_id
                        )
                      : null
                  )

          })
        );


      res.json({

        sermons,

        page,

        limit,

        total,

        hasMore:
          offset +
          sermons.length <
          total

      });

    } catch (error) {

      console.error(
        'GET /api/sermons error:',
        error
      );

      res.status(500).json({

        message:
          'Failed to load sermons.'

      });

    }

  }
);


/* ==========================================================================
   SERMON FILTERS
========================================================================== */

app.get(
  '/api/sermons/filters',
  async (
    req,
    res
  ) => {

    try {

      const years =
        await safe(
          `
            SELECT DISTINCT
              YEAR(sermon_date) AS year

            FROM sermons

            WHERE
              status='published'

              AND sermon_date IS NOT NULL

            ORDER BY
              year DESC
          `
        );


      const speakers =
        await safe(
          `
            SELECT DISTINCT
              speaker

            FROM sermons

            WHERE
              status='published'

              AND speaker IS NOT NULL

              AND TRIM(speaker) <> ''

            ORDER BY
              speaker ASC
          `
        );


      res.json({

        years:
          years
            .map(
              row =>
                Number(
                  row.year
                )
            )
            .filter(
              Boolean
            ),

        speakers:
          speakers
            .map(
              row =>
                String(
                  row.speaker || ''
                ).trim()
            )
            .filter(
              Boolean
            )

      });

    } catch (error) {

      console.error(
        'GET /api/sermons/filters error:',
        error
      );

      res.status(500).json({

        message:
          'Failed to load sermon filters.'

      });

    }

  }
);



/* ==========================================================================
   MEMBER NOTIFICATIONS
   Volunteers receive notifications targeted to "volunteers" plus "all".
========================================================================== */

app.get(
  '/api/notifications',
  auth,
  async (req, res) => {
    try {
      const memberRows = await safe(
        `SELECT id FROM members WHERE id=? LIMIT 1`,
        [req.user.id]
      );

      const isVolunteer = memberRows.length
        ? (await safe(
            `SELECT id FROM volunteers WHERE member_id=? AND status='active' LIMIT 1`,
            [req.user.id]
          )).length > 0
        : false;

      const targetGroups = isVolunteer
        ? ['all', 'volunteers']
        : ['all', 'members'];

      const rows = await safe(
        `
          SELECT id, title, body, target_group, created_at
          FROM notifications
          WHERE status='published'
            AND target_group IN (?, ?)
          ORDER BY created_at DESC, id DESC
        `,
        targetGroups
      );

      res.json({
        is_volunteer: isVolunteer,
        notifications: rows
      });
    } catch (e) {
      console.error('GET /api/notifications error:', e);
      res.status(500).json({ message: e.message });
    }
  }
);


/* ==========================================================================
   ADMIN VOLUNTEERS
========================================================================== */

app.get(
  '/api/admin/volunteers',
  auth,
  admin,
  async (req, res) => {
    try {
      const rows = await safe(`
        SELECT
          v.id,
          v.member_id,
          v.volunteer_role,
          v.status,
          v.created_at,
          m.member_id AS member_code,
          m.full_name,
          m.mobile,
          m.area,
          m.city
        FROM volunteers v
        INNER JOIN members m ON m.id=v.member_id
        ORDER BY m.full_name
      `);
      res.json(rows);
    } catch (e) {
      console.error('GET /api/admin/volunteers error:', e);
      res.status(500).json({ message: e.message });
    }
  }
);

app.get(
  '/api/admin/volunteers/available-members',
  auth,
  admin,
  async (req, res) => {
    try {
      const rows = await safe(`
        SELECT
          m.id,
          m.member_id,
          m.full_name,
          m.mobile,
          m.area,
          m.city
        FROM members m
        LEFT JOIN volunteers v ON v.member_id=m.id
        WHERE m.status='active'
          AND v.id IS NULL
        ORDER BY m.full_name
      `);
      res.json(rows);
    } catch (e) {
      console.error('GET /api/admin/volunteers/available-members error:', e);
      res.status(500).json({ message: e.message });
    }
  }
);

app.post(
  '/api/admin/volunteers',
  auth,
  admin,
  async (req, res) => {
    try {
      const memberId = Number(req.body.member_id);
      const role = String(req.body.volunteer_role || '').trim() || null;

      if (!memberId) {
        return res.status(400).json({ message: 'Member is required.' });
      }

      const memberRows = await safe(
        `SELECT id FROM members WHERE id=? AND status='active' LIMIT 1`,
        [memberId]
      );

      if (!memberRows.length) {
        return res.status(404).json({ message: 'Active member not found.' });
      }

      await safe(
        `INSERT INTO volunteers(member_id, volunteer_role, status) VALUES(?,?, 'active')`,
        [memberId, role]
      );

      res.json({ ok: true });
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ message: 'This member is already a volunteer.' });
      }
      console.error('POST /api/admin/volunteers error:', e);
      res.status(500).json({ message: e.message });
    }
  }
);

app.put(
  '/api/admin/volunteers/:id',
  auth,
  admin,
  async (req, res) => {
    try {
      await safe(
        `UPDATE volunteers SET volunteer_role=?, status=? WHERE id=?`,
        [
          String(req.body.volunteer_role || '').trim() || null,
          req.body.status === 'inactive' ? 'inactive' : 'active',
          req.params.id
        ]
      );
      res.json({ ok: true });
    } catch (e) {
      console.error('PUT /api/admin/volunteers/:id error:', e);
      res.status(500).json({ message: e.message });
    }
  }
);

app.delete(
  '/api/admin/volunteers/:id',
  auth,
  admin,
  async (req, res) => {
    try {
      await safe(`DELETE FROM volunteers WHERE id=?`, [req.params.id]);
      res.json({ ok: true });
    } catch (e) {
      console.error('DELETE /api/admin/volunteers/:id error:', e);
      res.status(500).json({ message: e.message });
    }
  }
);


/* ==========================================================================
   GENERIC PUBLIC / ADMIN CONTENT
========================================================================== */

for (
  const table of contentTables
) {

  /*
    IMPORTANT:
    /api/sermons is already defined above.
    Express will use the first matching route.
  */

  if (table !== 'sermons') {

    app.get(
      '/api/' + table,
      async (
        req,
        res
      ) => {

        try {

          const rows =
            await safe(
              `
                SELECT *
                FROM ${table}
                WHERE status='published'
                ORDER BY created_at DESC
              `
            );

          res.json(
            rows.map(
              row =>
                enrichContent(
                  table,
                  row
                )
            )
          );

        } catch (e) {

          console.error(
            `GET /api/${table} error:`,
            e
          );

          res.status(500).json({
            message: e.message
          });

        }

      }
    );

  }


  app.get(
    '/api/admin/content/' +
      table,

    auth,
    admin,

    async (
      req,
      res
    ) => {

      try {

        const rows =
          await safe(
            `
              SELECT *
              FROM ${table}
              ORDER BY created_at DESC
            `
          );

        res.json(
          rows.map(
            row =>
              enrichContent(
                table,
                row
              )
          )
        );

      } catch (e) {

        console.error(
          `Admin GET /api/admin/content/${table} error:`,
          e
        );

        res.status(500).json({
          message: e.message
        });

      }

    }
  );


  app.post(
    '/api/admin/content/' +
      table,

    auth,
    admin,

    async (
      req,
      res
    ) => {

      try {

        const fields =
          pickFields(
            table,
            req.body
          );

        if (!fields.length) {

          return res.status(400).json({
            message:
              'No valid fields'
          });

        }

        const values =
          fields.map(
            field =>
              req.body[field]
          );

        const result =
          await safe(
            `
              INSERT INTO ${table}
              (${fields.join(',')})
              VALUES
              (${fields.map(
                () => '?'
              ).join(',')})
            `,
            values
          );

        res.json({

          id:
            result.insertId,

          ok:
            true

        });

      } catch (e) {

        res.status(500).json({
          message: e.message
        });

      }

    }
  );


  app.put(
    '/api/admin/content/' +
      table +
      '/:id',

    auth,
    admin,

    async (
      req,
      res
    ) => {

      try {

        const fields =
          pickFields(
            table,
            req.body
          );

        if (!fields.length) {

          return res.status(400).json({
            message:
              'No valid fields'
          });

        }

        const values =
          fields.map(
            field =>
              req.body[field]
          );

        await safe(
          `
            UPDATE ${table}

            SET
              ${fields.map(
                field =>
                  field + '=?'
              ).join(',')}

            WHERE id=?
          `,
          [
            ...values,
            req.params.id
          ]
        );

        res.json({
          ok: true
        });

      } catch (e) {

        res.status(500).json({
          message: e.message
        });

      }

    }
  );


  app.delete(
    '/api/admin/content/' +
      table +
      '/:id',

    auth,
    admin,

    async (
      req,
      res
    ) => {

      try {

        await safe(
          `
            DELETE FROM ${table}
            WHERE id=?
          `,
          [req.params.id]
        );

        res.json({
          ok: true
        });

      } catch (e) {

        res.status(500).json({
          message: e.message
        });

      }

    }
  );

}


/* ==========================================================================
   SERMON UPLOAD
========================================================================== */

app.post(
  '/api/admin/sermons/upload',

  auth,
  admin,

  sermonUpload.fields([
    {
      name: 'image',
      maxCount: 1
    },
    {
      name: 'audio',
      maxCount: 1
    }
  ]),

  async (
    req,
    res
  ) => {

    const image =
      req.files?.image?.[0];

    const audio =
      req.files?.audio?.[0];

    try {

      if (
        !req.body.title ||
        !req.body.speaker ||
        !req.body.sermon_date
      ) {

        throw new Error(
          'Title, speaker and sermon date are required'
        );

      }

      validateSermonImage(
        image
      );

      validateSermonAudio(
        audio
      );


      const imageResult =
        await uploadFile(
          image.path,
          image.originalname,
          image.mimetype
        );


      const audioResult =
        await uploadFile(
          audio.path,
          audio.originalname,
          audio.mimetype
        );


      const imageFile =
        imageResult.id ||
        imageResult.name;

      const audioFile =
        audioResult.id ||
        audioResult.name;


      const result =
        await safe(
          `
            INSERT INTO sermons
            (
              title,
              speaker,
              sermon_date,
              description,
              audio_file_id,
              image_file_id,
              status
            )
            VALUES
            (?,?,?,?,?,?,?)
          `,
          [
            req.body.title,
            req.body.speaker,
            req.body.sermon_date,
            req.body.description || null,
            audioFile,
            imageFile,
            req.body.status || 'published'
          ]
        );


      cleanupTempFiles([
        image,
        audio
      ]);


      res.json({

        ok: true,

        message:
          'Sermon uploaded successfully',

        id:
          result.insertId,

        title:
          req.body.title,

        speaker:
          req.body.speaker,

        image_file_id:
          imageFile,

        audio_file_id:
          audioFile,

        image_url:
          sermonFileUrl(
            imageFile
          ),

        audio_url:
          sermonFileUrl(
            audioFile
          )

      });

    } catch (e) {

      cleanupTempFiles([
        image,
        audio
      ]);

      console.error(
        'Sermon upload error:',
        e
      );

      res.status(500).json({
        message: e.message
      });

    }

  }
);


/* ==========================================================================
   SERMON EDIT
========================================================================== */

app.put(
  '/api/admin/sermons/:id',

  auth,
  admin,

  sermonUpload.fields([
    {
      name: 'image',
      maxCount: 1
    },
    {
      name: 'audio',
      maxCount: 1
    }
  ]),

  async (
    req,
    res
  ) => {

    const image =
      req.files?.image?.[0];

    const audio =
      req.files?.audio?.[0];

    try {

      const rows =
        await safe(
          `
            SELECT *
            FROM sermons
            WHERE id=?
          `,
          [req.params.id]
        );


      if (!rows.length) {

        return res.status(404).json({
          message:
            'Sermon not found'
        });

      }


      const current =
        rows[0];


      let imageFile =
        current.image_file_id ||
        current.file_id;

      let audioFile =
        current.audio_file_id ||
        current.file_id;


      if (image) {

        validateSermonImage(
          image
        );

        const uploaded =
          await uploadFile(
            image.path,
            image.originalname,
            image.mimetype
          );

        imageFile =
          uploaded.id ||
          uploaded.name;

      }


      if (audio) {

        validateSermonAudio(
          audio
        );

        const uploaded =
          await uploadFile(
            audio.path,
            audio.originalname,
            audio.mimetype
          );

        audioFile =
          uploaded.id ||
          uploaded.name;

      }


      await safe(
        `
          UPDATE sermons

          SET
            title=?,
            speaker=?,
            sermon_date=?,
            description=?,
            audio_file_id=?,
            image_file_id=?,
            status=?

          WHERE id=?
        `,
        [
          req.body.title ||
            current.title,

          req.body.speaker ||
            current.speaker,

          req.body.sermon_date ||
            current.sermon_date,

          req.body.description ??
            current.description,

          audioFile,

          imageFile,

          req.body.status ||
            current.status ||
            'published',

          req.params.id
        ]
      );


      cleanupTempFiles([
        image,
        audio
      ]);


      res.json({
        ok: true
      });

    } catch (e) {

      cleanupTempFiles([
        image,
        audio
      ]);

      console.error(
        'Sermon update error:',
        e
      );

      res.status(500).json({
        message: e.message
      });

    }

  }
);


/* ==========================================================================
   WORSHIP SONG UPLOAD
========================================================================== */

app.post(
  '/api/admin/worship-songs/upload',

  auth,
  admin,

  audioUpload.single(
    'audio'
  ),

  async (
    req,
    res
  ) => {

    const audio =
      req.file;

    try {

      if (
        !req.body.title ||
        !req.body.title.trim()
      ) {

        return res.status(400).json({
          message:
            'Song title is required'
        });

      }

      validateSongAudio(
        audio
      );


      const uploaded =
        await uploadFile(
          audio.path,
          audio.originalname,
          audio.mimetype,
          'song-audio'
        );


      const audioFile =
        uploaded.id ||
        uploaded.name;


      const result =
        await safe(
          `
            INSERT INTO worship_songs
            (
              title,
              artist,
              lyrics,
              audio_file_id,
              status
            )
            VALUES
            (?,?,?,?,?)
          `,
          [
            req.body.title.trim(),
            req.body.artist || null,
            req.body.lyrics || null,
            audioFile,
            req.body.status || 'published'
          ]
        );


      cleanupTempFiles([
        audio
      ]);


      res.json({

        ok: true,
        success: true,

        id:
          result.insertId,

        title:
          req.body.title,

        artist:
          req.body.artist || null,

        audio_file_id:
          audioFile,

        audio_url:
          localMediaUrl(
            audioFile
          )

      });

    } catch (e) {

      cleanupTempFiles([
        audio
      ]);

      console.error(
        'Worship song upload error:',
        e
      );

      res.status(500).json({
        message:
          e.message ||
          'Worship song upload failed'
      });

    }

  }
);


/* ==========================================================================
   WORSHIP SONG EDIT
========================================================================== */

app.put(
  '/api/admin/worship-songs/:id',

  auth,
  admin,

  mediaUpload.single(
    'audio'
  ),

  async (
    req,
    res
  ) => {

    const audio =
      req.file;

    try {

      const rows =
        await safe(
          `
            SELECT *
            FROM worship_songs
            WHERE id=?
          `,
          [req.params.id]
        );


      if (!rows.length) {

        return res.status(404).json({
          message:
            'Worship song not found'
        });

      }


      const current =
        rows[0];

      let audioFile =
        current.audio_file_id;


      if (audio) {

        validateSongAudio(
          audio
        );

        const uploaded =
          await uploadFile(
            audio.path,
            audio.originalname,
            audio.mimetype,
            'song-audio'
          );

        audioFile =
          uploaded.id ||
          uploaded.name;

      }


      await safe(
        `
          UPDATE worship_songs

          SET
            title=?,
            artist=?,
            lyrics=?,
            audio_file_id=?,
            status=?

          WHERE id=?
        `,
        [
          req.body.title?.trim() ||
            current.title,

          req.body.artist ??
            current.artist,

          req.body.lyrics ??
            current.lyrics,

          audioFile,

          req.body.status ||
            current.status ||
            'published',

          req.params.id
        ]
      );


      cleanupTempFiles([
        audio
      ]);


      res.json({

        ok: true,

        audio_file_id:
          audioFile,

        audio_url:
          localMediaUrl(
            audioFile
          )

      });

    } catch (e) {

      cleanupTempFiles([
        audio
      ]);

      console.error(
        'Worship song update error:',
        e
      );

      res.status(500).json({
        message: e.message
      });

    }

  }
);


/* ==========================================================================
   PUBLIC GALLERY ALBUM LIST
========================================================================== */

app.get(
  '/api/gallery',

  async (
    req,
    res
  ) => {

    try {

      const rows =
        await safe(
          `
            SELECT

              a.id,
              a.title,
              a.description,
              a.status,
              a.created_at,
              a.updated_at,
              a.cover_file_id,

              COUNT(m.id)
                AS media_count,

              COALESCE(
                SUM(
                  CASE
                    WHEN m.media_type='image'
                    THEN 1
                    ELSE 0
                  END
                ),
                0
              ) AS image_count,

              COALESCE(
                SUM(
                  CASE
                    WHEN m.media_type='video'
                    THEN 1
                    ELSE 0
                  END
                ),
                0
              ) AS video_count

            FROM gallery_albums a

            LEFT JOIN gallery_media m
              ON m.album_id=a.id

            WHERE
              a.status='published'

            GROUP BY
              a.id,
              a.title,
              a.description,
              a.status,
              a.created_at,
              a.updated_at,
              a.cover_file_id

            ORDER BY
              a.created_at DESC
          `
        );


      res.json(
        rows.map(
          enrichGalleryAlbum
        )
      );

    } catch (e) {

      console.error(
        'GET /api/gallery error:',
        e
      );

      res.status(500).json({
        message: e.message
      });

    }

  }
);


/* ==========================================================================
   PUBLIC OPEN GALLERY ALBUM
========================================================================== */

app.get(
  '/api/gallery/:id',

  async (
    req,
    res
  ) => {

    try {

      const albums =
        await safe(
          `
            SELECT

              id,
              title,
              description,
              status,
              created_at,
              updated_at,
              cover_file_id

            FROM gallery_albums

            WHERE
              id=?
              AND status='published'

            LIMIT 1
          `,
          [req.params.id]
        );


      if (!albums.length) {

        return res.status(404).json({
          message:
            'Gallery album not found'
        });

      }


      const media =
        await safe(
          `
            SELECT

              id,
              album_id,
              media_type,
              file_id,
              created_at

            FROM gallery_media

            WHERE album_id=?

            ORDER BY
              created_at ASC,
              id ASC
          `,
          [req.params.id]
        );


      res.json({

        album:
          enrichGalleryAlbum(
            albums[0]
          ),

        media:
          media.map(
            enrichGalleryMedia
          )

      });

    } catch (e) {

      console.error(
        'GET /api/gallery/:id error:',
        e
      );

      res.status(500).json({
        message: e.message
      });

    }

  }
);


/* ==========================================================================
   ADMIN GALLERY ALBUMS
========================================================================== */

app.get(
  '/api/admin/gallery/albums',

  auth,
  admin,

  async (
    req,
    res
  ) => {

    try {

      const rows =
        await safe(
          `
            SELECT

              a.id,
              a.title,
              a.description,
              a.status,
              a.created_at,
              a.updated_at,
              a.cover_file_id,

              COUNT(m.id)
                AS media_count,

              COALESCE(
                SUM(
                  CASE
                    WHEN m.media_type='image'
                    THEN 1
                    ELSE 0
                  END
                ),
                0
              ) AS image_count,

              COALESCE(
                SUM(
                  CASE
                    WHEN m.media_type='video'
                    THEN 1
                    ELSE 0
                  END
                ),
                0
              ) AS video_count

            FROM gallery_albums a

            LEFT JOIN gallery_media m
              ON m.album_id=a.id

            GROUP BY
              a.id,
              a.title,
              a.description,
              a.status,
              a.created_at,
              a.updated_at,
              a.cover_file_id

            ORDER BY
              a.created_at DESC
          `
        );


      res.json(
        rows.map(
          enrichGalleryAlbum
        )
      );

    } catch (e) {

      console.error(
        'Admin Gallery albums error:',
        e
      );

      res.status(500).json({
        message: e.message
      });

    }

  }
);


/* ==========================================================================
   ADMIN OPEN GALLERY ALBUM
========================================================================== */

app.get(
  '/api/admin/gallery/albums/:id',

  auth,
  admin,

  async (
    req,
    res
  ) => {

    try {

      const albums =
        await safe(
          `
            SELECT *
            FROM gallery_albums
            WHERE id=?
            LIMIT 1
          `,
          [req.params.id]
        );


      if (!albums.length) {

        return res.status(404).json({
          message:
            'Gallery album not found'
        });

      }


      const media =
        await safe(
          `
            SELECT

              id,
              album_id,
              media_type,
              file_id,
              created_at

            FROM gallery_media

            WHERE album_id=?

            ORDER BY
              created_at ASC,
              id ASC
          `,
          [req.params.id]
        );


      res.json({

        album:
          enrichGalleryAlbum(
            albums[0]
          ),

        media:
          media.map(
            enrichGalleryMedia
          )

      });

    } catch (e) {

      console.error(
        'Admin open gallery album error:',
        e
      );

      res.status(500).json({
        message: e.message
      });

    }

  }
);


/* ==========================================================================
   CREATE GALLERY ALBUM + MEDIA
========================================================================== */

app.post(
  '/api/admin/gallery/albums/upload',

  auth,
  admin,

  mediaUpload.fields([
    {
      name: 'images',
      maxCount: 100
    },
    {
      name: 'videos',
      maxCount: 100
    }
  ]),

  async (
    req,
    res
  ) => {

    const tempFiles = [];

    try {

      const images =
        req.files?.images || [];

      const videos =
        req.files?.videos || [];

      const allFiles = [
        ...images,
        ...videos
      ];


      if (!allFiles.length) {

        return res.status(400).json({
          message:
            'Please upload at least one image or video.'
        });

      }


      const title =
        String(
          req.body.title || ''
        ).trim();


      const description =
        String(
          req.body.description || ''
        );


      const status =
        String(
          req.body.status ||
          'published'
        );


      if (!title) {

        return res.status(400).json({
          message:
            'Album title is required.'
        });

      }


      const coverOriginalName =
        String(
          req.body.cover_original_name ||
          ''
        ).trim();


      if (coverOriginalName) {

        const exists =
          images.some(
            file =>
              file.originalname ===
              coverOriginalName
          );

        if (!exists) {

          return res.status(400).json({
            message:
              'Selected cover photo was not included in this batch.'
          });

        }

      }


      for (
        const file of allFiles
      ) {

        tempFiles.push(
          file.path
        );

      }


      const albumResult =
        await safe(
          `
            INSERT INTO gallery_albums
            (
              title,
              description,
              status
            )
            VALUES
            (?, ?, ?)
          `,
          [
            title,
            description || null,
            status
          ]
        );


      const albumId =
        albumResult.insertId;


      let coverFileId =
        null;


      /* IMAGES */

      for (
        const file of images
      ) {

        const uploaded =
          await uploadFile(
            file.path,
            file.originalname,
            file.mimetype,
            'gallery-image'
          );


        const fileId =
          uploaded?.id ||
          uploaded?.name;


        if (!fileId) {

          throw new Error(
            `Google Drive upload failed for ${file.originalname}`
          );

        }


        await safe(
          `
            INSERT INTO gallery_media
            (
              album_id,
              media_type,
              file_id
            )
            VALUES
            (?, 'image', ?)
          `,
          [
            albumId,
            fileId
          ]
        );


        if (
          coverOriginalName &&
          file.originalname ===
            coverOriginalName
        ) {

          coverFileId =
            fileId;

        }


        if (!coverFileId) {

          const count =
            await safe(
              `
                SELECT COUNT(*) AS c
                FROM gallery_media
                WHERE album_id=?
                AND media_type='image'
              `,
              [albumId]
            );


          if (
            Number(
              count[0]?.c
            ) === 1
          ) {

            coverFileId =
              fileId;

          }

        }

      }


      /* VIDEOS */

      for (
        const file of videos
      ) {

        const uploaded =
          await uploadFile(
            file.path,
            file.originalname,
            file.mimetype,
            'gallery-video'
          );


        const fileId =
          uploaded?.id ||
          uploaded?.name;


        if (!fileId) {

          throw new Error(
            `Google Drive upload failed for ${file.originalname}`
          );

        }


        await safe(
          `
            INSERT INTO gallery_media
            (
              album_id,
              media_type,
              file_id
            )
            VALUES
            (?, 'video', ?)
          `,
          [
            albumId,
            fileId
          ]
        );

      }


      if (coverFileId) {

        await safe(
          `
            UPDATE gallery_albums

            SET cover_file_id=?

            WHERE id=?
          `,
          [
            coverFileId,
            albumId
          ]
        );

      }


      res.json({

        success: true,

        message:
          `${allFiles.length} file${
            allFiles.length === 1
              ? ''
              : 's'
          } uploaded successfully.`,

        album_id:
          albumId,

        uploaded:
          allFiles.length,

        images:
          images.length,

        videos:
          videos.length,

        cover_file_id:
          coverFileId

      });

    } catch (e) {

      console.error(
        'Gallery batch upload error:',
        e
      );

      res.status(500).json({

        message:
          e.message ||
          'Gallery upload failed.'

      });

    } finally {

      for (
        const file of tempFiles
      ) {

        try {

          if (
            fs.existsSync(file)
          ) {

            fs.unlinkSync(
              file
            );

          }

        } catch {}

      }

    }

  }
);


/* ==========================================================================
   EDIT GALLERY ALBUM
========================================================================== */

app.put(
  '/api/admin/gallery/albums/:id',

  auth,
  admin,

  async (
    req,
    res
  ) => {

    try {

      const rows =
        await safe(
          `
            SELECT *
            FROM gallery_albums
            WHERE id=?
            LIMIT 1
          `,
          [req.params.id]
        );


      if (!rows.length) {

        return res.status(404).json({
          message:
            'Gallery album not found'
        });

      }


      const current =
        rows[0];


      const title =
        String(
          req.body.title ??
          current.title
        ).trim();


      const description =
        String(
          req.body.description ??
          current.description ??
          ''
        ).trim();


      const status =
        String(
          req.body.status ??
          current.status ??
          'published'
        ).trim();


      if (!title) {

        return res.status(400).json({
          message:
            'Gallery title is required.'
        });

      }


      await safe(
        `
          UPDATE gallery_albums

          SET
            title=?,
            description=?,
            status=?

          WHERE id=?
        `,
        [
          title,
          description,
          status,
          req.params.id
        ]
      );


      res.json({

        ok: true,

        message:
          'Gallery album updated successfully'

      });

    } catch (e) {

      console.error(
        'Gallery album update error:',
        e
      );

      res.status(500).json({
        message: e.message
      });

    }

  }
);


/* ==========================================================================
   CHANGE GALLERY COVER
========================================================================== */

app.put(
  '/api/admin/gallery/albums/:id/cover',

  auth,
  admin,

  async (
    req,
    res
  ) => {

    try {

      const albumId =
        Number(
          req.params.id
        );

      const mediaId =
        Number(
          req.body.media_id
        );


      if (
        !Number.isInteger(albumId) ||
        albumId <= 0
      ) {

        return res.status(400).json({
          message:
            'Invalid album ID.'
        });

      }


      if (
        !Number.isInteger(mediaId) ||
        mediaId <= 0
      ) {

        return res.status(400).json({
          message:
            'Invalid media ID.'
        });

      }


      const albums =
        await safe(
          `
            SELECT id
            FROM gallery_albums
            WHERE id=?
            LIMIT 1
          `,
          [albumId]
        );


      if (!albums.length) {

        return res.status(404).json({
          message:
            'Gallery album not found.'
        });

      }


      const media =
        await safe(
          `
            SELECT
              id,
              album_id,
              media_type,
              file_id

            FROM gallery_media

            WHERE
              id=?
              AND album_id=?

            LIMIT 1
          `,
          [
            mediaId,
            albumId
          ]
        );


      if (!media.length) {

        return res.status(404).json({
          message:
            'Gallery media not found in this album.'
        });

      }


      if (
        media[0].media_type !==
        'image'
      ) {

        return res.status(400).json({
          message:
            'Only photos can be used as an album cover.'
        });

      }


      await safe(
        `
          UPDATE gallery_albums

          SET cover_file_id=?

          WHERE id=?
        `,
        [
          media[0].file_id,
          albumId
        ]
      );


      res.json({

        ok: true,

        message:
          'Gallery cover updated successfully.',

        cover_file_id:
          media[0].file_id,

        cover_url:
          localMediaUrl(
            media[0].file_id
          )

      });

    } catch (e) {

      console.error(
        'Gallery cover update error:',
        e
      );

      res.status(500).json({
        message: e.message
      });

    }

  }
);


/* ==========================================================================
   ADD MEDIA TO EXISTING ALBUM
========================================================================== */

app.post(
  '/api/admin/gallery/albums/:id/media',

  auth,
  admin,

  mediaUpload.fields([
    {
      name: 'images',
      maxCount: 50
    },
    {
      name: 'videos',
      maxCount: 50
    }
  ]),

  async (
    req,
    res
  ) => {

    const images =
      req.files?.images || [];

    const videos =
      req.files?.videos || [];

    try {

      const albums =
        await safe(
          `
            SELECT *
            FROM gallery_albums
            WHERE id=?
            LIMIT 1
          `,
          [req.params.id]
        );


      if (!albums.length) {

        return res.status(404).json({
          message:
            'Gallery album not found'
        });

      }


      const total =
        images.length +
        videos.length;


      if (!total) {

        return res.status(400).json({
          message:
            'Please select at least one image or video.'
        });

      }


      for (
        const file of images
      ) {

        validateGalleryImage(
          file
        );

      }


      for (
        const file of videos
      ) {

        validateGalleryVideo(
          file
        );

      }


      const createdMedia = [];

      let firstNewImage =
        null;


      /* IMAGES */

      for (
        const file of images
      ) {

        const uploaded =
          await uploadFile(
            file.path,
            file.originalname,
            file.mimetype,
            'gallery-image'
          );


        const fileId =
          uploaded.id ||
          uploaded.name;


        const result =
          await safe(
            `
              INSERT INTO gallery_media
              (
                album_id,
                media_type,
                file_id
              )
              VALUES
              (?, ?, ?)
            `,
            [
              req.params.id,
              'image',
              fileId
            ]
          );


        createdMedia.push({

          id:
            result.insertId,

          media_type:
            'image',

          file_id:
            fileId,

          original_name:
            file.originalname,

          media_url:
            localMediaUrl(
              fileId
            )

        });


        if (!firstNewImage) {
          firstNewImage = fileId;
        }


        cleanupTempFile(
          file
        );

      }


      /* VIDEOS */

      for (
        const file of videos
      ) {

        const uploaded =
          await uploadFile(
            file.path,
            file.originalname,
            file.mimetype,
            'gallery-video'
          );


        const fileId =
          uploaded.id ||
          uploaded.name;


        const result =
          await safe(
            `
              INSERT INTO gallery_media
              (
                album_id,
                media_type,
                file_id
              )
              VALUES
              (?, ?, ?)
            `,
            [
              req.params.id,
              'video',
              fileId
            ]
          );


        createdMedia.push({

          id:
            result.insertId,

          media_type:
            'video',

          file_id:
            fileId,

          original_name:
            file.originalname,

          media_url:
            localMediaUrl(
              fileId
            )

        });


        cleanupTempFile(
          file
        );

      }


      const currentCover =
        albums[0].cover_file_id;


      if (
        !currentCover &&
        firstNewImage
      ) {

        await safe(
          `
            UPDATE gallery_albums

            SET cover_file_id=?

            WHERE id=?
          `,
          [
            firstNewImage,
            req.params.id
          ]
        );

      }


      res.json({

        success: true,

        message:
          `${createdMedia.length} media item(s) added successfully.`,

        media:
          createdMedia

      });

    } catch (e) {

      cleanupTempFiles([
        ...images,
        ...videos
      ]);

      console.error(
        'Add gallery media error:',
        e
      );

      res.status(500).json({
        message: e.message
      });

    }

  }
);


/* ==========================================================================
   EDIT GALLERY MEDIA
========================================================================== */

app.put(
  '/api/admin/gallery/media/:id',

  auth,
  admin,

  mediaUpload.fields([
    {
      name: 'image',
      maxCount: 1
    },
    {
      name: 'video',
      maxCount: 1
    }
  ]),

  async (
    req,
    res
  ) => {

    const image =
      req.files?.image?.[0];

    const video =
      req.files?.video?.[0];

    try {

      const rows =
        await safe(
          `
            SELECT *
            FROM gallery_media
            WHERE id=?
            LIMIT 1
          `,
          [req.params.id]
        );


      if (!rows.length) {

        return res.status(404).json({
          message:
            'Gallery media not found'
        });

      }


      const current =
        rows[0];


      let fileId =
        current.file_id;

      let mediaType =
        current.media_type;


      if (image) {

        validateGalleryImage(
          image
        );

        const uploaded =
          await uploadFile(
            image.path,
            image.originalname,
            image.mimetype,
            'gallery-image'
          );

        fileId =
          uploaded.id ||
          uploaded.name;

        mediaType =
          'image';

      }


      if (video) {

        validateGalleryVideo(
          video
        );

        const uploaded =
          await uploadFile(
            video.path,
            video.originalname,
            video.mimetype,
            'gallery-video'
          );

        fileId =
          uploaded.id ||
          uploaded.name;

        mediaType =
          'video';

      }


      await safe(
        `
          UPDATE gallery_media

          SET
            media_type=?,
            file_id=?

          WHERE id=?
        `,
        [
          mediaType,
          fileId,
          req.params.id
        ]
      );


      if (
        mediaType === 'video'
      ) {

        const albums =
          await safe(
            `
              SELECT id
              FROM gallery_albums
              WHERE cover_file_id=?
            `,
            [current.file_id]
          );


        for (
          const album of albums
        ) {

          const replacement =
            await safe(
              `
                SELECT file_id
                FROM gallery_media

                WHERE
                  album_id=?
                  AND media_type='image'
                  AND id<>?

                ORDER BY
                  id ASC

                LIMIT 1
              `,
              [
                album.id,
                req.params.id
              ]
            );


          await safe(
            `
              UPDATE gallery_albums

              SET cover_file_id=?

              WHERE id=?
            `,
            [
              replacement[0]?.file_id ||
                null,

              album.id
            ]
          );

        }

      }


      cleanupTempFiles([
        image,
        video
      ]);


      res.json({

        ok: true,

        media_type:
          mediaType,

        file_id:
          fileId,

        media_url:
          localMediaUrl(
            fileId
          )

      });

    } catch (e) {

      cleanupTempFiles([
        image,
        video
      ]);

      console.error(
        'Gallery media update error:',
        e
      );

      res.status(500).json({
        message: e.message
      });

    }

  }
);


/* ==========================================================================
   DELETE GALLERY MEDIA
========================================================================== */

app.delete(
  '/api/admin/gallery/media/:id',

  auth,
  admin,

  async (
    req,
    res
  ) => {

    try {

      const rows =
        await safe(
          `
            SELECT *
            FROM gallery_media
            WHERE id=?
            LIMIT 1
          `,
          [req.params.id]
        );


      if (!rows.length) {

        return res.status(404).json({
          message:
            'Gallery media not found'
        });

      }


      const media =
        rows[0];


      const albums =
        await safe(
          `
            SELECT id
            FROM gallery_albums
            WHERE cover_file_id=?
          `,
          [media.file_id]
        );


      await safe(
        `
          DELETE FROM gallery_media
          WHERE id=?
        `,
        [req.params.id]
      );


      for (
        const album of albums
      ) {

        const replacement =
          await safe(
            `
              SELECT file_id
              FROM gallery_media

              WHERE
                album_id=?
                AND media_type='image'

              ORDER BY
                id ASC

              LIMIT 1
            `,
            [album.id]
          );


        await safe(
          `
            UPDATE gallery_albums

            SET cover_file_id=?

            WHERE id=?
          `,
          [
            replacement[0]?.file_id ||
              null,

            album.id
          ]
        );

      }


      res.json({

        ok: true,

        message:
          'Gallery media deleted successfully'

      });

    } catch (e) {

      console.error(
        'Delete gallery media error:',
        e
      );

      res.status(500).json({
        message: e.message
      });

    }

  }
);


/* ==========================================================================
   DELETE GALLERY ALBUM
========================================================================== */

app.delete(
  '/api/admin/gallery/albums/:id',

  auth,
  admin,

  async (
    req,
    res
  ) => {

    try {

      const albums =
        await safe(
          `
            SELECT id
            FROM gallery_albums
            WHERE id=?
            LIMIT 1
          `,
          [req.params.id]
        );


      if (!albums.length) {

        return res.status(404).json({
          message:
            'Gallery album not found'
        });

      }


      await safe(
        `
          DELETE FROM gallery_albums
          WHERE id=?
        `,
        [req.params.id]
      );


      res.json({

        ok: true,

        message:
          'Gallery album deleted successfully'

      });

    } catch (e) {

      console.error(
        'Delete gallery album error:',
        e
      );

      res.status(500).json({
        message: e.message
      });

    }

  }
);


/* ==========================================================================
   GENERAL FILE UPLOAD
========================================================================== */

app.post(
  '/api/files',

  auth,
  admin,

  upload.single(
    'file'
  ),

  async (
    req,
    res
  ) => {

    try {

      if (!req.file) {

        return res.status(400).json({
          message:
            'File required'
        });

      }


      const result =
        await uploadFile(
          req.file.path,
          req.file.originalname,
          req.file.mimetype
        );


      cleanupTempFile(
        req.file
      );


      res.json(
        result
      );

    } catch (e) {

      cleanupTempFile(
        req.file
      );

      res.status(500).json({
        message: e.message
      });

    }

  }
);


/* ==========================================================================
   PRAYER REQUESTS
========================================================================== */

app.get(
  '/api/prayers',

  auth,

  async (
    req,
    res
  ) => {

    try {

      res.json(
        await safe(
          `
            SELECT
  p.*,
  p.name AS full_name,
  p.request AS request_text,
  p.admin_notes AS response_text,
  0 AS is_anonymous
FROM prayer_requests p
ORDER BY
  p.created_at DESC
          `
        )
      );

    } catch (e) {

      res.status(500).json({
        message: e.message
      });

    }

  }
);


app.post(
  '/api/prayers',

  auth,

  async (
    req,
    res
  ) => {

    try {

      const p =
        req.body;


      const result =
        await safe(
          `
            INSERT INTO prayer_requests
            (
              member_id,
              title,
              request_text,
              is_anonymous,
              status
            )
            VALUES
            (?,?,?,?,?)
          `,
          [
            reqUserId(req),
            p.title,
            p.request_text,
            !!p.is_anonymous,
            'new'
          ]
        );


      res.json({
        id:
          result.insertId
      });

    } catch (e) {

      res.status(500).json({
        message: e.message
      });

    }

  }
);


function reqUserId(req) {

  try {

    const authToken =
      (
        req.headers.authorization ||
        ''
      ).replace(
        /^Bearer\s+/i,
        ''
      );

    return jwt.verify(
      authToken,
      secret()
    ).id;

  } catch {

    return null;

  }

}


app.put(
  '/api/prayers/:id',

  auth,
  admin,

  async (
    req,
    res
  ) => {

    try {

      await safe(
        `
          UPDATE prayer_requests

          SET
            status=?,
            response_text=?,
            assigned_to=?

          WHERE id=?
        `,
        [
          req.body.status || 'new',
          req.body.response_text || null,
          req.body.assigned_to || null,
          req.params.id
        ]
      );


      res.json({
        ok: true
      });

    } catch (e) {

      res.status(500).json({
        message: e.message
      });

    }

  }
);


/* ==========================================================================
   EXPENSES
========================================================================== */

app.get(
  '/api/expenses',

  auth,
  admin,

  async (
    req,
    res
  ) => {

    try {

      res.json(
        await safe(
          `
            SELECT *

            FROM expenses

            ORDER BY
              expense_date DESC,
              id DESC
          `
        )
      );

    } catch (e) {

      res.status(500).json({
        message: e.message
      });

    }

  }
);


app.post(
  '/api/expenses',

  auth,
  admin,

  async (
    req,
    res
  ) => {

    try {

      const e =
        req.body;


      if (
        !e.title ||
        !e.amount
      ) {

        return res.status(400).json({
          message:
            'Title and amount required'
        });

      }


      const result =
        await safe(
          `
            INSERT INTO expenses
            (
              title,
              amount,
              expense_date,
              category,
              description,
              paid_by,
              notes
            )
            VALUES
            (?,?,?,?,?,?,?)
          `,
          [
            e.title,
            e.amount,
            e.expense_date || new Date(),
            e.category || 'Other',
            e.description || null,
            e.paid_by || null,
            e.notes || null
          ]
        );


      res.json({
        id:
          result.insertId
      });

    } catch (e) {

      res.status(500).json({
        message: e.message
      });

    }

  }
);


app.delete(
  '/api/expenses/:id',

  auth,
  admin,

  async (
    req,
    res
  ) => {

    try {

      await safe(
        `
          DELETE FROM expenses
          WHERE id=?
        `,
        [req.params.id]
      );


      res.json({
        ok: true
      });

    } catch (e) {

      res.status(500).json({
        message: e.message
      });

    }

  }
);


/* ==========================================================================
   FINANCE
========================================================================== */

app.get(
  '/api/finance',

  auth,
  admin,

  async (
    req,
    res
  ) => {

    try {

      const expenses =
        await safe(
          `
            SELECT

              COALESCE(
                SUM(amount),
                0
              ) total

            FROM expenses
          `
        );


      const settings =
        await safe(
          `
            SELECT
              starting_balance

            FROM finance_settings

            LIMIT 1
          `
        );


      const startingBalance =
        Number(
          settings[0]?.starting_balance ||
          0
        );


      const totalExpenses =
        Number(
          expenses[0]?.total ||
          0
        );


      res.json({

        starting_balance:
          startingBalance,

        total_expenses:
          totalExpenses,

        current_balance:
          startingBalance -
          totalExpenses

      });

    } catch (e) {

      res.status(500).json({
        message: e.message
      });

    }

  }
);


app.put(
  '/api/finance',

  auth,
  admin,

  async (
    req,
    res
  ) => {

    try {

      await safe(
        `
          UPDATE finance_settings

          SET starting_balance=?
        `,
        [
          req.body.starting_balance ||
            0
        ]
      );


      res.json({
        ok: true
      });

    } catch (e) {

      res.status(500).json({
        message: e.message
      });

    }

  }
);


/* ==========================================================================
   CLEANUP HELPERS
========================================================================== */

function cleanupTempFile(file) {

  if (
    file?.path &&
    fs.existsSync(
      file.path
    )
  ) {

    try {
      fs.unlinkSync(
        file.path
      );
    } catch {}

  }

}


function cleanupTempFiles(
  files = []
) {

  for (
    const file of files
  ) {

    cleanupTempFile(
      file
    );

  }

}


/* ==========================================================================
   ENSURE DATABASE SCHEMA
========================================================================== */

async function tableExists(table) {
  const rows = await safe(
    `
      SELECT COUNT(*) AS c
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA=DATABASE()
        AND TABLE_NAME=?
    `,
    [table]
  );
  return Number(rows[0]?.c || 0) > 0;
}


async function columnExists(table, column) {
  const rows = await safe(
    `
      SELECT COUNT(*) AS c
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA=DATABASE()
        AND TABLE_NAME=?
        AND COLUMN_NAME=?
    `,
    [table, column]
  );
  return Number(rows[0]?.c || 0) > 0;
}


async function ensureColumn(table, column, definition) {
  if (await columnExists(table, column)) return;

  await safe(
    `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`
  );
}


async function ensureContentTable(table, createSql, columns = {}) {
  await safe(createSql);

  for (const [column, definition] of Object.entries(columns)) {
    await ensureColumn(table, column, definition);
  }
}


async function ensureContentSchema() {

  /* ------------------------------------------------------------------------
     MEMBERS - MAP URL
  ------------------------------------------------------------------------ */

  await ensureColumn(
    'members',
    'map_url',
    'VARCHAR(500) NULL'
  );


  /* ------------------------------------------------------------------------
     CORE CONTENT TABLES
  ------------------------------------------------------------------------ */

  await ensureContentTable(
    'announcements',
    `
      CREATE TABLE IF NOT EXISTS announcements(
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NULL,
        body TEXT NULL,
        status VARCHAR(30) DEFAULT 'published',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `,
    {
      title: 'VARCHAR(255) NULL',
      body: 'TEXT NULL',
      status: "VARCHAR(30) DEFAULT 'published'",
      created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    }
  );


  await ensureContentTable(
    'events',
    `
      CREATE TABLE IF NOT EXISTS events(
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NULL,
        event_date DATETIME NULL,
        location VARCHAR(255) NULL,
        description TEXT NULL,
        speaker VARCHAR(200) NULL,
        banner_file_id VARCHAR(255) NULL,
        status VARCHAR(30) DEFAULT 'published',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `,
    {
      title: 'VARCHAR(255) NULL',
      event_date: 'DATETIME NULL',
      location: 'VARCHAR(255) NULL',
      description: 'TEXT NULL',
      speaker: 'VARCHAR(200) NULL',
      banner_file_id: 'VARCHAR(255) NULL',
      status: "VARCHAR(30) DEFAULT 'published'",
      created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    }
  );


  await ensureContentTable(
    'bible_verses',
    `
      CREATE TABLE IF NOT EXISTS bible_verses(
        id INT AUTO_INCREMENT PRIMARY KEY,
        reference_name VARCHAR(255) NULL,
        verse_text TEXT NULL,
        status VARCHAR(30) DEFAULT 'published',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `,
    {
      reference_name: 'VARCHAR(255) NULL',
      verse_text: 'TEXT NULL',
      status: "VARCHAR(30) DEFAULT 'published'",
      created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    }
  );


  await ensureContentTable(
    'ministries',
    `
      CREATE TABLE IF NOT EXISTS ministries(
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NULL,
        description TEXT NULL,
        leader VARCHAR(200) NULL,
        status VARCHAR(30) DEFAULT 'published',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `,
    {
      name: 'VARCHAR(255) NULL',
      description: 'TEXT NULL',
      leader: 'VARCHAR(200) NULL',
      status: "VARCHAR(30) DEFAULT 'published'",
      created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    }
  );


  await ensureContentTable(
    'notifications',
    `
      CREATE TABLE IF NOT EXISTS notifications(
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NULL,
        body TEXT NULL,
        target_group VARCHAR(100) NULL,
        status VARCHAR(30) DEFAULT 'published',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `,
    {
      title: 'VARCHAR(255) NULL',
      body: 'TEXT NULL',
      target_group: 'VARCHAR(100) NULL',
      status: "VARCHAR(30) DEFAULT 'published'",
      created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    }
  );


  /* ------------------------------------------------------------------------
     VOLUNTEERS
  ------------------------------------------------------------------------ */

  await ensureContentTable(
    'volunteers',
    `
      CREATE TABLE IF NOT EXISTS volunteers(
        id INT AUTO_INCREMENT PRIMARY KEY,
        member_id INT NOT NULL UNIQUE,
        volunteer_role VARCHAR(150) NULL,
        status VARCHAR(30) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `,
    {
      member_id: 'INT NOT NULL',
      volunteer_role: 'VARCHAR(150) NULL',
      status: "VARCHAR(30) DEFAULT 'active'",
      created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    }
  );


  await ensureContentTable(
    'church_information',
    `
      CREATE TABLE IF NOT EXISTS church_information(
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NULL,
        body TEXT NULL,
        phone VARCHAR(50) NULL,
        email VARCHAR(150) NULL,
        address TEXT NULL,
        website VARCHAR(255) NULL,
        map_url VARCHAR(500) NULL,
        status VARCHAR(30) DEFAULT 'published',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `,
    {
      title: 'VARCHAR(255) NULL',
      body: 'TEXT NULL',
      phone: 'VARCHAR(50) NULL',
      email: 'VARCHAR(150) NULL',
      address: 'TEXT NULL',
      website: 'VARCHAR(255) NULL',
      map_url: 'VARCHAR(500) NULL',
      status: "VARCHAR(30) DEFAULT 'published'",
      created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    }
  );


  await ensureContentTable(
    'service_schedule',
    `
      CREATE TABLE IF NOT EXISTS service_schedule(
        id INT AUTO_INCREMENT PRIMARY KEY,
        service_name VARCHAR(255) NULL,
        day_of_week VARCHAR(30) NULL,
        start_time TIME NULL,
        end_time TIME NULL,
        location VARCHAR(255) NULL,
        description TEXT NULL,
        status VARCHAR(30) DEFAULT 'published',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `,
    {
      service_name: 'VARCHAR(255) NULL',
      day_of_week: 'VARCHAR(30) NULL',
      start_time: 'TIME NULL',
      end_time: 'TIME NULL',
      location: 'VARCHAR(255) NULL',
      description: 'TEXT NULL',
      status: "VARCHAR(30) DEFAULT 'published'",
      created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    }
  );


  /* ------------------------------------------------------------------------
     SERMONS
  ------------------------------------------------------------------------ */

  if (await tableExists('sermons')) {
    await ensureColumn(
      'sermons',
      'status',
      "VARCHAR(30) DEFAULT 'published'"
    );

    await ensureColumn(
      'sermons',
      'audio_file_id',
      'VARCHAR(255) NULL'
    );

    await ensureColumn(
      'sermons',
      'image_file_id',
      'VARCHAR(255) NULL'
    );

    await ensureColumn(
      'sermons',
      'created_at',
      'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    );
  } else {
    await ensureContentTable(
      'sermons',
      `
        CREATE TABLE IF NOT EXISTS sermons(
          id INT AUTO_INCREMENT PRIMARY KEY,
          title VARCHAR(255) NULL,
          speaker VARCHAR(200) NULL,
          sermon_date DATE NULL,
          description TEXT NULL,
          file_id VARCHAR(255) NULL,
          audio_file_id VARCHAR(255) NULL,
          image_file_id VARCHAR(255) NULL,
          status VARCHAR(30) DEFAULT 'published',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `,
      {
        title: 'VARCHAR(255) NULL',
        speaker: 'VARCHAR(200) NULL',
        sermon_date: 'DATE NULL',
        description: 'TEXT NULL',
        file_id: 'VARCHAR(255) NULL',
        audio_file_id: 'VARCHAR(255) NULL',
        image_file_id: 'VARCHAR(255) NULL',
        status: "VARCHAR(30) DEFAULT 'published'",
        created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
      }
    );
  }


  /* ------------------------------------------------------------------------
     WORSHIP SONGS
  ------------------------------------------------------------------------ */

  if (await tableExists('worship_songs')) {
    await ensureColumn(
      'worship_songs',
      'status',
      "VARCHAR(30) DEFAULT 'published'"
    );

    await ensureColumn(
      'worship_songs',
      'audio_file_id',
      'VARCHAR(255) NULL'
    );

    await ensureColumn(
      'worship_songs',
      'created_at',
      'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    );
  } else {
    await ensureContentTable(
      'worship_songs',
      `
        CREATE TABLE IF NOT EXISTS worship_songs(
          id INT AUTO_INCREMENT PRIMARY KEY,
          title VARCHAR(255) NULL,
          artist VARCHAR(200) NULL,
          lyrics TEXT NULL,
          audio_file_id VARCHAR(255) NULL,
          status VARCHAR(30) DEFAULT 'published',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `,
      {
        title: 'VARCHAR(255) NULL',
        artist: 'VARCHAR(200) NULL',
        lyrics: 'TEXT NULL',
        audio_file_id: 'VARCHAR(255) NULL',
        status: "VARCHAR(30) DEFAULT 'published'",
        created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
      }
    );
  }


  /* ------------------------------------------------------------------------
     OLD GALLERY TABLE - ONLY MIGRATE IF IT EXISTS
  ------------------------------------------------------------------------ */

  if (await tableExists('gallery')) {
    await ensureColumn(
      'gallery',
      'image_file_id',
      'VARCHAR(255) NULL'
    );

    await ensureColumn(
      'gallery',
      'video_file_id',
      'VARCHAR(255) NULL'
    );
  }


  /* ------------------------------------------------------------------------
     GALLERY ALBUMS
  ------------------------------------------------------------------------ */

  await ensureContentTable(
    'gallery_albums',
    `
      CREATE TABLE IF NOT EXISTS gallery_albums(
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NULL,
        description TEXT NULL,
        cover_file_id VARCHAR(255) NULL,
        status VARCHAR(30) DEFAULT 'published',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          ON UPDATE CURRENT_TIMESTAMP
      )
    `,
    {
      title: 'VARCHAR(255) NULL',
      description: 'TEXT NULL',
      cover_file_id: 'VARCHAR(255) NULL',
      status: "VARCHAR(30) DEFAULT 'published'",
      created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
      updated_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
    }
  );


  /* ------------------------------------------------------------------------
     GALLERY MEDIA
  ------------------------------------------------------------------------ */

  await safe(
    `
      CREATE TABLE IF NOT EXISTS gallery_media(
        id INT AUTO_INCREMENT PRIMARY KEY,
        album_id INT NOT NULL,
        media_type VARCHAR(20) NOT NULL,
        file_id VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_gallery_media_album
          FOREIGN KEY (album_id)
          REFERENCES gallery_albums(id)
          ON DELETE CASCADE
      )
    `
  );

  await ensureColumn(
    'gallery_media',
    'created_at',
    'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
  );


  /* ------------------------------------------------------------------------
     AUTO ASSIGN GALLERY COVERS
  ------------------------------------------------------------------------ */

  await safe(
    `
      UPDATE gallery_albums a
      SET a.cover_file_id = (
        SELECT gm.file_id
        FROM gallery_media gm
        WHERE gm.album_id=a.id
          AND gm.media_type='image'
        ORDER BY gm.id ASC
        LIMIT 1
      )
      WHERE (a.cover_file_id IS NULL OR a.cover_file_id='')
        AND EXISTS (
          SELECT 1
          FROM gallery_media gm2
          WHERE gm2.album_id=a.id
            AND gm2.media_type='image'
        )
    `
  );


  /* ------------------------------------------------------------------------
     FINANCE SETTINGS
  ------------------------------------------------------------------------ */

  await safe(
    `
      CREATE TABLE IF NOT EXISTS finance_settings(
        id INT AUTO_INCREMENT PRIMARY KEY,
        starting_balance DECIMAL(15,2) DEFAULT 0
      )
    `
  );

  await ensureColumn(
    'finance_settings',
    'starting_balance',
    'DECIMAL(15,2) DEFAULT 0'
  );

  const financeRows = await safe(
    `SELECT id FROM finance_settings LIMIT 1`
  );

 if (!financeRows.length) {
  await safe(
    `INSERT INTO finance_settings(setting_name, starting_balance)
     VALUES('starting_balance', 0)`
  );
}


  console.log(
    'Content database schema verified successfully.'
  );
}


/* ==========================================================================
   MULTER / SERVER ERROR HANDLER
========================================================================== */

app.use(
  (
    err,
    req,
    res,
    next
  ) => {

    if (
      err &&
      err.name === 'MulterError'
    ) {

      console.error(
        'MULTER ERROR:',
        err
      );

      return res.status(400).json({

        message:
          `Upload error: ${err.message}`,

        code:
          err.code || null

      });

    }


    if (err) {

      console.error(
        'SERVER ERROR:',
        err
      );

      return res.status(500).json({

        message:
          err.message ||
          'Internal server error.'

      });

    }


    next();

  }
);


/* ==========================================================================
   START SERVER
========================================================================== */

ensureContentSchema()

  .then(
    () => {

      app.listen(

        Number(
          process.env.PORT ||
          3000
        ),

        '0.0.0.0',

        () => {

          console.log(
            'Church API running on port ' +
            (
              process.env.PORT ||
              3000
            )
          );

          console.log(
            'Sermon folder: ' +
            DRIVE_FOLDER
          );

        }

      );

    }
  )

  .catch(
    error => {

      console.error(
        'Schema setup failed:',
        error
      );

      process.exit(1);

    }
  );
