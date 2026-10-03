const API =
  localStorage.API_URL ||
  `${window.location.protocol}//${window.location.hostname}:3000/api`;

let token =
  localStorage.memberToken || '';

let member =
  JSON.parse(
    localStorage.member || 'null'
  );

const app =
  document.querySelector('#app');


/* =========================================================
   HELPERS
========================================================= */

const esc = s =>
  String(s ?? '').replace(
    /[&<>"']/g,
    c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c])
  );


async function get(path) {

  try {

    const response =
      await fetch(
        API + path,
        {
          headers:
            token
              ? {
                  Authorization:
                    'Bearer ' +
                    token
                }
              : {}
        }
      );


    const data =
      await response
        .json()
        .catch(() => ({}));


    if (!response.ok) {

      throw new Error(
        data.message ||
        `Server error ${response.status}`
      );

    }


    return data;

  } catch (error) {

    console.error(
      'API error:',
      error
    );

    throw error;

  }

}


/* =========================================================
   DATE HELPERS
========================================================= */

function getDateValue(item) {

  const date =
    item.sermon_date ||
    item.created_at ||
    item.updated_at ||
    item.event_date ||
    '';

  if (!date) {
    return 0;
  }


  const value =
    new Date(date).getTime();


  return isNaN(value)
    ? 0
    : value;

}


function formatDate(dateValue) {

  if (!dateValue) {
    return '';
  }


  const date =
    new Date(dateValue);


  if (isNaN(date.getTime())) {
    return '';
  }


  return date.toLocaleDateString(
    'en-IN',
    {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }
  );

}


/* =========================================================
   LAYOUT
========================================================= */

function layout(
  active,
  body
) {

  app.innerHTML = `

    <header>

      <div>

        <b>
          ✟ NJC Church
        </b>

        

      </div>


      <button
        class="icon"
        onclick="logout()"
        aria-label="${
          token
            ? 'Logout'
            : 'Login'
        }"
      >

        ${
          token
            ? '↪'
            : '🔐'
        }

      </button>

    </header>


    <main>

      ${body}

    </main>


    <nav>

      <!-- HOME -->

      <button
        class="${
          active === 'home'
            ? 'on'
            : ''
        }"
        onclick="home()"
      >

        <span>
          ⌂
        </span>

        Home

      </button>


      <!-- SERMONS -->

      <button
        class="${
          active === 'sermons'
            ? 'on'
            : ''
        }"
        onclick="sermons()"
      >

        <span>
          ▶
        </span>

        Sermons

      </button>


      <!-- SONGS -->

      <button
        class="${
          active === 'songs'
            ? 'on'
            : ''
        }"
        onclick="songs()"
      >

        <span>
          ♪
        </span>

        Songs

      </button>


      <!-- GALLERY -->

      <button
        class="${
          active === 'gallery'
            ? 'on'
            : ''
        }"
        onclick="gallery()"
      >

        <span>
          ▣
        </span>

        Gallery

      </button>


      <!-- PROFILE -->

      <button
        class="${
          active === 'profile'
            ? 'on'
            : ''
        }"
        onclick="profile()"
      >

        <span>
          ●
        </span>

        Profile

      </button>

    </nav>

  `;

}


/* =========================================================
   HOME
========================================================= */

async function home() {

  try {

    const [
      announcements,
      eventsData,
      verses,
      notificationData
    ] =
      await Promise.all([
        get('/announcements'),
        get('/events'),
        get('/bible_verses'),
        token
          ? get('/notifications').catch(error => {
              if (error?.message === 'Server error 401' || /Unauthorized/i.test(error?.message || '')) {
                token = '';
                member = null;
                localStorage.removeItem('memberToken');
                localStorage.removeItem('member');
                return { notifications: [], is_volunteer: false };
              }
              throw error;
            })
          : Promise.resolve({ notifications: [], is_volunteer: false })
      ]);

    const homeNotifications =
      notificationData?.notifications || [];

    const isVolunteer =
      Boolean(notificationData?.is_volunteer);


    layout(
      'home',
      `

        <!-- =================================================
             WELCOME NOTE
        ================================================== -->

        <section class="hero">

          <h1>

            ${
              member
                ? `Welcome, ${esc(
                    member.full_name
                      ?.split(' ')[0] ||
                    'Member'
                  )}`
                : 'Welcome'
            }

          </h1>


          <p>
            Stay connected with your church family.
          </p>


          ${
            !token
              ? `

                <button
                  onclick="login()"
                >
                  Member Login
                </button>

              `
              : ''
          }

        </section>

       <!-- =================================================
             VOLUNTEER NOTIFICATIONS
        ================================================== -->

        ${
          token && homeNotifications.length
            ? `
              <h2>
                VOLUNTEER NOTIFICATIONS
              </h2>

              <div class="home-notifications">

                ${homeNotifications
                  .slice(0, 5)
                  .map(
                    item => `
                      <article class="card">
                        <small>
                          ${esc(formatDate(item.created_at))}
                          ${
                            item.target_group === 'volunteers'
                              ? ' • Volunteer'
                              : ''
                          }
                        </small>

                        <h3>
                          ${esc(item.title || 'Notification')}
                        </h3>

                        ${
                          item.body
                            ? `<p>${esc(item.body)}</p>`
                            : ''
                        }
                      </article>
                    `
                  )
                  .join('')}

              </div>
            `
            : ''
        }



        <!-- =================================================
             DAILY BIBLE VERSE
        ================================================== -->

        <h2>
          Daily Bible Verse
        </h2>


        <div class="card">

          ${
            verses?.[0]
              ? `

                <b>
                  ${esc(
                    verses[0]
                      .reference_name
                  )}
                </b>


                <p>
                  ${esc(
                    verses[0]
                      .verse_text
                  )}
                </p>

              `
              : `

                <p>
                  Add today's verse from Admin Panel.
                </p>

              `
          }

        </div>


        <!-- =================================================
             UPCOMING EVENTS
        ================================================== -->

        <h2>
          Upcoming Events
        </h2>


        ${
          eventsData?.length
            ? `

              <div class="home-events">

                ${eventsData
                  .slice(0, 3)
                  .map(
                    item => `

                      <article
                        class="card"
                      >

                        <h3>
                          ${esc(
                            item.title
                          )}
                        </h3>


                        <p>

                          📅
                          ${esc(
                            item.event_date
                          )}

                          <br>

                          📍
                          ${esc(
                            item.location
                          )}

                        </p>


                        ${
                          item.description
                            ? `

                              <p>
                                ${esc(
                                  item.description
                                )}
                              </p>

                            `
                            : ''
                        }


                        ${
                          item.speaker
                            ? `

                              <small>
                                Speaker:
                                ${esc(
                                  item.speaker
                                )}
                              </small>

                            `
                            : ''
                        }

                      </article>

                    `
                  )
                  .join('')}

              </div>

            `
            : `

              <div class="card">

                <p>
                  No upcoming events.
                </p>

              </div>

            `
        }


        <!-- =================================================
             ANNOUNCEMENTS
        ================================================== -->

        <h2>
          Announcements
        </h2>


        ${
          announcements?.length
            ? `

              <div class="home-announcements">

                ${announcements
                  .slice(0, 4)
                  .map(
                    item => `

                      <article
                        class="card"
                      >

                        <b>
                          ${esc(
                            item.title
                          )}
                        </b>


                        ${
                          item.body
                            ? `

                              <p>
                                ${esc(
                                  item.body
                                )}
                              </p>

                            `
                            : ''
                        }

                      </article>

                    `
                  )
                  .join('')}

              </div>

            `
            : `

              <div class="card">

                <p>
                  No announcements yet.
                </p>

              </div>

            `
        }


 
        <!-- =================================================
             PRAYER REQUEST
        ================================================== -->

        <h2>
          Prayer Request
        </h2>


        <div
          class="card prayer-home-card"
        >

          <p>
            Have a prayer need?
            Share it with us.
          </p>


          <button
            onclick="prayer()"
          >
            Submit Prayer Request
          </button>

        </div>

      `
    );

  } catch (error) {

    console.error(
      'Home loading error:',
      error
    );


    layout(
      'home',
      `

        <div class="card">

          <h2>
            Unable to load
          </h2>


          <p>
            ${esc(
              error.message
            )}
          </p>


          <button
            onclick="home()"
          >
            Try Again
          </button>

        </div>

      `
    );

  }

}


/* =========================================================
   PRAYER
========================================================= */

async function prayer() {

  if (!token) {

    return login(true);

  }


  layout(
    'home',
    `

      <div
        class="page-header"
      >

        <button
          class="secondary"
          onclick="home()"
        >
          ← Back
        </button>


        <h1>
          Prayer Request
        </h1>

      </div>


      <div class="card">

        <label>

          Title

          <input
            id="pt"
            placeholder="Prayer topic"
          >

        </label>


        <label>

          Request

          <textarea
            id="pr"
            placeholder="Write your prayer request"
          ></textarea>

        </label>


        <label>

          <input
            type="checkbox"
            id="anon"
          >

          Submit anonymously

        </label>


        <button
          onclick="sendPrayer()"
        >
          Submit Prayer
        </button>


        <button
          class="secondary"
          onclick="home()"
        >
          Cancel
        </button>

      </div>

    `
  );

}


/* =========================================================
   SEND PRAYER
========================================================= */

async function sendPrayer() {

  try {

    const title =
      document.querySelector(
        '#pt'
      )?.value.trim();


    const request =
      document.querySelector(
        '#pr'
      )?.value.trim();


    const anonymous =
      document.querySelector(
        '#anon'
      )?.checked ||
      false;


    if (!title) {

      throw new Error(
        'Please enter a prayer topic.'
      );

    }


    if (!request) {

      throw new Error(
        'Please enter your prayer request.'
      );

    }


    const response =
      await fetch(
        API + '/prayers',
        {
          method:
            'POST',

          headers: {

            'Content-Type':
              'application/json',

            Authorization:
              'Bearer ' +
              token

          },

          body:
            JSON.stringify({
              title,
              request_text:
                request,
              is_anonymous:
                anonymous
            })

        }
      );


    const data =
      await response
        .json()
        .catch(() => ({}));


    if (!response.ok) {

      throw new Error(
        data.message ||
        'Please login again.'
      );

    }


    alert(
      'Prayer request submitted.'
    );


    home();

  } catch (error) {

    alert(
      error.message
    );

  }

}


/* =========================================================
   SERMONS
   SEARCH + MONTH + SPEAKER + SORT
========================================================= */

async function sermons() {

  try {

    const sermonsResponse = await get('/sermons');

const sermonsData = Array.isArray(sermonsResponse)
  ? sermonsResponse
  : Array.isArray(sermonsResponse?.sermons)
    ? sermonsResponse.sermons
    : Array.isArray(sermonsResponse?.data)
      ? sermonsResponse.data
      : [];
    /* -------------------------------------------------------
       MONTH OPTIONS
    ------------------------------------------------------- */

    const monthMap =
      new Map();


    sermonsData.forEach(
      sermon => {

        if (
          !sermon.sermon_date
        ) {
          return;
        }


        const date =
          new Date(
            sermon.sermon_date
          );


        if (
          isNaN(
            date.getTime()
          )
        ) {
          return;
        }


        const year =
          date.getFullYear();


        const month =
          date.getMonth();


        const key =
          `${year}-${String(
            month + 1
          ).padStart(
            2,
            '0'
          )}`;


        const label =
          date.toLocaleDateString(
            'en-IN',
            {
              month:
                'long',

              year:
                'numeric'
            }
          );


        monthMap.set(
          key,
          {
            year,
            month,
            label
          }
        );

      }
    );


    const monthOptions =
      Array.from(
        monthMap.values()
      )
        .sort(
          (a, b) => {

            if (
              a.year !==
              b.year
            ) {

              return (
                b.year -
                a.year
              );

            }


            return (
              b.month -
              a.month
            );

          }
        )
        .map(
          item => `

            <option
              value="${item.year}-${String(
                item.month + 1
              ).padStart(
                2,
                '0'
              )}"
            >

              ${esc(
                item.label
              )}

            </option>

          `
        )
        .join('');


    /* -------------------------------------------------------
       SPEAKER OPTIONS
    ------------------------------------------------------- */

    const speakers =
      [
        ...new Set(
          sermonsData
            .map(
              sermon =>
                String(
                  sermon.speaker ||
                  ''
                ).trim()
            )
            .filter(Boolean)
        )
      ].sort(
        (
          a,
          b
        ) =>
          a.localeCompare(
            b,
            undefined,
            {
              sensitivity:
                'base'
            }
          )
      );


    const speakerOptions =
      speakers
        .map(
          speaker => `

            <option
              value="${esc(
                speaker
              )}"
            >

              ${esc(
                speaker
              )}

            </option>

          `
        )
        .join('');


    /* -------------------------------------------------------
       PAGE
    ------------------------------------------------------- */

    layout(
      'sermons',
      `

        <h1>
          Sermons
        </h1>


        <div
          class="sermon-search"
        >

          <span>
            🔍
          </span>


          <input
            id="sermonSearch"
            type="search"
            placeholder="Search sermon title, speaker..."
            autocomplete="off"
          >

        </div>


        <div
          class="sermon-filters"
        >

          <select
            id="sermonMonth"
          >

            <option value="all">
              All Months
            </option>

            ${monthOptions}

          </select>


          <select
            id="sermonSpeaker"
          >

            <option value="all">
              All Speakers
            </option>

            ${speakerOptions}

          </select>


          <select
            id="sermonSort"
          >

            <option value="latest">
              Latest first
            </option>

            <option value="oldest">
              Oldest first
            </option>

            <option value="az">
              Title A–Z
            </option>

            <option value="za">
              Title Z–A
            </option>

          </select>

        </div>


        <div
          id="sermonFilterInfo"
          class="sermon-filter-info"
        ></div>


        <div
          id="sermonCount"
          class="sermon-count"
        ></div>


        <div
          id="sermonResults"
        ></div>

      `
    );


    const searchInput =
      document.querySelector(
        '#sermonSearch'
      );


    const monthSelect =
      document.querySelector(
        '#sermonMonth'
      );


    const speakerSelect =
      document.querySelector(
        '#sermonSpeaker'
      );


    const sortSelect =
      document.querySelector(
        '#sermonSort'
      );


    const filterInfo =
      document.querySelector(
        '#sermonFilterInfo'
      );


    const count =
      document.querySelector(
        '#sermonCount'
      );


    const results =
      document.querySelector(
        '#sermonResults'
      );


    function renderSermons() {

      const search =
        (
          searchInput.value ||
          ''
        )
          .trim()
          .toLowerCase();


      const selectedMonth =
        monthSelect.value;


      const selectedSpeaker =
        speakerSelect.value;


      const selectedSort =
        sortSelect.value;


      let filtered =
        sermonsData.filter(
          sermon => {

            const searchable = [

              sermon.title,

              sermon.speaker,

              sermon.description,

              sermon.sermon_date

            ]
              .filter(Boolean)
              .join(' ')
              .toLowerCase();


            if (
              search &&
              !searchable.includes(
                search
              )
            ) {

              return false;

            }


            if (
              selectedMonth !==
              'all'
            ) {

              if (
                !sermon.sermon_date
              ) {

                return false;

              }


              const date =
                new Date(
                  sermon.sermon_date
                );


              if (
                isNaN(
                  date.getTime()
                )
              ) {

                return false;

              }


              const key =
                `${date.getFullYear()}-${String(
                  date.getMonth() + 1
                ).padStart(
                  2,
                  '0'
                )}`;


              if (
                key !==
                selectedMonth
              ) {

                return false;

              }

            }


            if (
              selectedSpeaker !==
              'all'
            ) {

              const actualSpeaker =
                String(
                  sermon.speaker ||
                  ''
                ).trim();


              if (
                actualSpeaker !==
                selectedSpeaker
              ) {

                return false;

              }

            }


            return true;

          }
        );


      filtered.sort(
        (a, b) => {

          if (
            selectedSort ===
            'latest'
          ) {

            return (
              getDateValue(b) -
              getDateValue(a)
            );

          }


          if (
            selectedSort ===
            'oldest'
          ) {

            return (
              getDateValue(a) -
              getDateValue(b)
            );

          }


          if (
            selectedSort ===
            'az'
          ) {

            return String(
              a.title ||
              ''
            ).localeCompare(
              String(
                b.title ||
                ''
              ),
              undefined,
              {
                sensitivity:
                  'base'
              }
            );

          }


          if (
            selectedSort ===
            'za'
          ) {

            return String(
              b.title ||
              ''
            ).localeCompare(
              String(
                a.title ||
                ''
              ),
              undefined,
              {
                sensitivity:
                  'base'
              }
            );

          }


          return 0;

        }
      );


      const filters = [];


      if (
        selectedMonth !==
        'all'
      ) {

        const option =
          monthSelect.options[
            monthSelect.selectedIndex
          ];


        filters.push(
          option.text
        );

      }


      if (
        selectedSpeaker !==
        'all'
      ) {

        filters.push(
          selectedSpeaker
        );

      }


      filterInfo.textContent =
        filters.length
          ? `Filtered by: ${filters.join(
              ' • '
            )}`
          : '';


      count.textContent =
        `${filtered.length} sermon${
          filtered.length ===
          1
            ? ''
            : 's'
        }`;


      if (
        !filtered.length
      ) {

        results.innerHTML = `

          <div
            class="card sermon-empty"
          >

            <div
              class="sermon-empty-icon"
            >
              🔎
            </div>


            <h3>
              No sermons found
            </h3>


            <p>
              Try another search,
              month, or speaker.
            </p>

          </div>

        `;

        return;

      }


      results.innerHTML = `

        <div
          class="sermon-list"
        >

          ${filtered
            .map(
              sermon => {

                const formattedDate =
                  formatDate(
                    sermon.sermon_date
                  );


                const title =
                  sermon.title ||
                  'Untitled Sermon';


                const imageUrl =
                  sermon.image_url ||
                  '';


                const audioUrl =
                  sermon.audio_url ||
                  '';


                return `

                  <article
                    class="card sermon-card"
                  >

                    ${
                      imageUrl
                        ? `

                          <div
                            class="sermon-image-wrap"
                          >

                            <img
                              src="${esc(
                                imageUrl
                              )}"
                              alt="${esc(
                                title
                              )}"
                              class="sermon-image"
                              loading="lazy"
                              onerror="
                                this.style.display='none';
                                this.parentElement.querySelector('.sermon-image-error').style.display='flex';
                              "
                            >


                            <div
                              class="sermon-image-error"
                              style="display:none"
                            >
                              Image unavailable
                            </div>

                          </div>

                        `
                        : `

                          <div
                            class="sermon-no-image"
                          >
                            No sermon image
                          </div>

                        `
                    }


                    <div
                      class="sermon-content"
                    >

                      <h3>
                        ${esc(
                          title
                        )}
                      </h3>


                      ${
                        sermon.speaker
                          ? `

                            <p
                              class="sermon-speaker"
                            >
                              Pastor
                              ${esc(
                                sermon.speaker
                              )}
                            </p>

                          `
                          : ''
                      }


                      ${
                        formattedDate
                          ? `

                            <p
                              class="sermon-date"
                            >

                              

                              ${esc(
                                formattedDate
                              )}

                            </p>

                          `
                          : ''
                      }


                      ${
                        sermon.description
                          ? `

                            <p
                              class="sermon-description"
                            >
                              ${esc(
                                sermon.description
                              )}
                            </p>

                          `
                          : ''
                      }


                      ${
                        audioUrl
                          ? `

                            <div
                              class="sermon-player"
                            >

                              <audio
                                controls
                                preload="metadata"
                                src="${esc(
                                  audioUrl
                                )}"
                              >

                                Your browser does not
                                support audio playback.

                              </audio>

                            </div>

                          `
                          : `

                            <div
                              class="sermon-unavailable"
                            >
                              Audio not available
                            </div>

                          `
                      }

                    </div>

                  </article>

                `;

              }
            )
            .join('')}

        </div>

      `;

    }


    searchInput.addEventListener(
      'input',
      renderSermons
    );


    monthSelect.addEventListener(
      'change',
      renderSermons
    );


    speakerSelect.addEventListener(
      'change',
      renderSermons
    );


    sortSelect.addEventListener(
      'change',
      renderSermons
    );


    renderSermons();

  } catch (error) {

    console.error(
      'Unable to load sermons:',
      error
    );


    layout(
      'sermons',
      `

        <h1>
          Sermons
        </h1>


        <div
          class="card"
        >

          <h3>
            Unable to load sermons
          </h3>


          <p>
            ${esc(
              error.message
            )}
          </p>


          <button
            onclick="sermons()"
          >
            Try Again
          </button>

        </div>

      `
    );

  }

}


/* =========================================================
   SONGS
   SEARCH + SORT
========================================================= */

async function songs() {

  try {

    const songsData =
      await get(
        '/worship_songs'
      );


    layout(
      'songs',
      `

        <h1>
          Worship Songs
        </h1>


        <div
          class="song-search"
        >

          <span>
            🔍
          </span>


          <input
            id="songSearch"
            type="search"
            placeholder="Search song title, artist..."
            autocomplete="off"
          >

        </div>


        <div
          class="song-filters"
        >

          <select
            id="songSort"
          >

            <option value="latest">
              Latest first
            </option>

            <option value="oldest">
              Oldest first
            </option>

            <option value="az">
              Title A–Z
            </option>

            <option value="za">
              Title Z–A
            </option>

          </select>

        </div>


        <div
          id="songFilterInfo"
          class="song-filter-info"
        ></div>


        <div
          id="songCount"
          class="song-count"
        ></div>


        <div
          id="songResults"
        ></div>

      `
    );


    const searchInput =
      document.querySelector(
        '#songSearch'
      );


    const sortSelect =
      document.querySelector(
        '#songSort'
      );


    const filterInfo =
      document.querySelector(
        '#songFilterInfo'
      );


    const count =
      document.querySelector(
        '#songCount'
      );


    const results =
      document.querySelector(
        '#songResults'
      );


    function renderSongs() {

      const search =
        (
          searchInput.value ||
          ''
        )
          .trim()
          .toLowerCase();


      const selectedSort =
        sortSelect.value;


      let filtered =
        songsData.filter(
          song => {

            const searchable = [

              song.title,

              song.artist,

              song.lyrics

            ]
              .filter(Boolean)
              .join(' ')
              .toLowerCase();


            return (
              !search ||
              searchable.includes(
                search
              )
            );

          }
        );


      filtered.sort(
        (a, b) => {

          if (
            selectedSort ===
            'latest'
          ) {

            return (
              getDateValue(b) -
              getDateValue(a)
            );

          }


          if (
            selectedSort ===
            'oldest'
          ) {

            return (
              getDateValue(a) -
              getDateValue(b)
            );

          }


          if (
            selectedSort ===
            'az'
          ) {

            return String(
              a.title ||
              ''
            ).localeCompare(
              String(
                b.title ||
                ''
              ),
              undefined,
              {
                sensitivity:
                  'base'
              }
            );

          }


          if (
            selectedSort ===
            'za'
          ) {

            return String(
              b.title ||
              ''
            ).localeCompare(
              String(
                a.title ||
                ''
              ),
              undefined,
              {
                sensitivity:
                  'base'
              }
            );

          }


          return 0;

        }
      );


      filterInfo.textContent =
        search
          ? `Search results for: ${search}`
          : '';


      count.textContent =
        `${filtered.length} song${
          filtered.length === 1
            ? ''
            : 's'
        }`;


      if (
        !filtered.length
      ) {

        results.innerHTML = `

          <div
            class="card"
          >

            <div
              class="sermon-empty-icon"
            >
              🔎
            </div>


            <h3>
              No worship songs found
            </h3>


            <p>
              ${
                search
                  ? 'Try another search.'
                  : 'No worship songs available yet.'
              }
            </p>

          </div>

        `;

        return;

      }


      results.innerHTML = `

        <div
          class="song-list"
        >

          ${filtered
            .map(
              song => {

                const songDate =
                  formatDate(
                    song.created_at
                  );


                const title =
                  song.title ||
                  'Untitled Song';


                return `

                  <article
                    class="card song-card"
                  >

                    <div
                      class="song-header"
                    >

                      <div>

                        <h3>
                          ${esc(
                            title
                          )}
                        </h3>


                        ${
                          song.artist
                            ? `

                              <p
                                class="song-artist"
                              >

                                ${esc(
                                  song.artist
                                )}

                              </p>

                            `
                            : ''
                        }

                      </div>


                      <span
                        class="song-icon"
                      >
                        ♪
                      </span>

                    </div>


                    ${
                      song.audio_url
                        ? `

                          <audio
                            controls
                            preload="metadata"
                            src="${esc(
                              song.audio_url
                            )}"
                          >

                            Your browser does not
                            support audio playback.

                          </audio>

                        `
                        : `

                          <div
                            class="sermon-unavailable"
                          >
                            Audio not available
                          </div>

                        `
                    }


                    ${
                      song.lyrics
                        ? `

                          <details
                            class="song-lyrics"
                          >

                            <summary>
                              Lyrics
                            </summary>


                            <p>
                              ${esc(
                                song.lyrics
                              )}
                            </p>

                          </details>

                        `
                        : ''
                    }

                  </article>

                `;

              }
            )
            .join('')}

        </div>

      `;

    }


    searchInput.addEventListener(
      'input',
      renderSongs
    );


    sortSelect.addEventListener(
      'change',
      renderSongs
    );


    renderSongs();

  } catch (error) {

    console.error(
      'Unable to load worship songs:',
      error
    );


    layout(
      'songs',
      `

        <h1>
          Worship Songs
        </h1>


        <div
          class="card"
        >

          <h3>
            Unable to load worship songs
          </h3>


          <p>
            ${esc(
              error.message
            )}
          </p>


          <button
            onclick="songs()"
          >
            Try Again
          </button>

        </div>

      `
    );

  }

}


/* =========================================================
   GALLERY
   ALBUM LIST
   SEARCH + SORT
========================================================= */

async function gallery() {

  try {

    const galleryData =
      await get(
        '/gallery'
      );


    layout(
      'gallery',
      `

        <div
          class="page-header"
        >

          <h1>
            Gallery
          </h1>

        </div>


        <!-- SEARCH -->

        <div
          class="gallery-search"
        >

          <span>
            🔍
          </span>


          <input
            id="gallerySearch"
            type="search"
            placeholder="Search albums..."
            autocomplete="off"
          >

        </div>


        <!-- SORT -->

        <div
          class="gallery-filters"
        >

          <select
            id="gallerySort"
          >

            <option value="latest">
              Latest first
            </option>

            <option value="oldest">
              Oldest first
            </option>

            <option value="az">
              Title A–Z
            </option>

            <option value="za">
              Title Z–A
            </option>

          </select>

        </div>


        <div
          id="galleryFilterInfo"
          class="gallery-filter-info"
        ></div>


        <div
          id="galleryCount"
          class="gallery-count"
        ></div>


        <div
          id="galleryResults"
        ></div>

      `
    );


    const searchInput =
      document.querySelector(
        '#gallerySearch'
      );


    const sortSelect =
      document.querySelector(
        '#gallerySort'
      );


    const filterInfo =
      document.querySelector(
        '#galleryFilterInfo'
      );


    const count =
      document.querySelector(
        '#galleryCount'
      );


    const results =
      document.querySelector(
        '#galleryResults'
      );


    /* =====================================================
       RENDER ALBUM LIST
    ===================================================== */

    function renderGallery() {

      const search =
        (
          searchInput.value ||
          ''
        )
          .trim()
          .toLowerCase();


      const selectedSort =
        sortSelect.value;


      let filtered =
        Array.isArray(
          galleryData
        )
          ? galleryData.filter(
              album => {

                const searchable = [

                  album.title,

                  album.description

                ]
                  .filter(Boolean)
                  .join(' ')
                  .toLowerCase();


                return (
                  !search ||
                  searchable.includes(
                    search
                  )
                );

              }
            )
          : [];


      /* ===================================================
         SORT
      =================================================== */

      filtered.sort(
        (a, b) => {

          if (
            selectedSort ===
            'latest'
          ) {

            return (
              getDateValue(b) -
              getDateValue(a)
            );

          }


          if (
            selectedSort ===
            'oldest'
          ) {

            return (
              getDateValue(a) -
              getDateValue(b)
            );

          }


          if (
            selectedSort ===
            'az'
          ) {

            return String(
              a.title ||
              ''
            ).localeCompare(
              String(
                b.title ||
                ''
              ),
              undefined,
              {
                sensitivity:
                  'base'
              }
            );

          }


          if (
            selectedSort ===
            'za'
          ) {

            return String(
              b.title ||
              ''
            ).localeCompare(
              String(
                a.title ||
                ''
              ),
              undefined,
              {
                sensitivity:
                  'base'
              }
            );

          }


          return 0;

        }
      );


      /* ===================================================
         FILTER INFO
      =================================================== */

      filterInfo.textContent =
        search
          ? `Search results for: ${search}`
          : '';


      /* ===================================================
         COUNT
      =================================================== */

      count.textContent =
        `${filtered.length} album${
          filtered.length === 1
            ? ''
            : 's'
        }`;


      /* ===================================================
         EMPTY
      =================================================== */

      if (
        !filtered.length
      ) {

        results.innerHTML = `

          <div
            class="card"
          >

            <div
              class="sermon-empty-icon"
            >
              🔎
            </div>


            <h3>
              No albums found
            </h3>


            <p>
              ${
                search
                  ? 'Try another search.'
                  : 'No gallery albums available yet.'
              }
            </p>

          </div>

        `;

        return;

      }


      /* ===================================================
         ALBUM CARDS
      =================================================== */

      results.innerHTML = `

        <div
          class="gallery-album-grid"
        >

          ${filtered
            .map(
              album => {

                const albumId =
                  Number(
                    album.id
                  );


                const title =
                  album.title ||
                  'Untitled Album';


                const coverUrl =
                  album.cover_url ||
                  '';


                const imageCount =
                  Number(
                    album.image_count ||
                    0
                  );


                const videoCount =
                  Number(
                    album.video_count ||
                    0
                  );


                const mediaCount =
                  Number(
                    album.media_count ||
                    0
                  );


                let mediaInfo = '';


                if (
                  imageCount &&
                  videoCount
                ) {

                  mediaInfo =
                    `${imageCount} Photos • ${videoCount} Videos`;

                } else if (
                  imageCount
                ) {

                  mediaInfo =
                    `${imageCount} Photo${
                      imageCount === 1
                        ? ''
                        : 's'
                    }`;

                } else if (
                  videoCount
                ) {

                  mediaInfo =
                    `${videoCount} Video${
                      videoCount === 1
                        ? ''
                        : 's'
                    }`;

                } else {

                  mediaInfo =
                    `${mediaCount} Media`;

                }


                return `

                  <article
                    class="card gallery-album-card"
                    onclick="openGalleryAlbum(${albumId})"
                    role="button"
                    tabindex="0"
                    aria-label="Open ${esc(
                      title
                    )}"
                    onkeydown="
                      if (
                        event.key === 'Enter' ||
                        event.key === ' '
                      ) {
                        event.preventDefault();
                        openGalleryAlbum(${albumId});
                      }
                    "
                  >

                    <div
                      class="gallery-album-cover"
                    >

                      ${
                        coverUrl
                          ? `

                            <img
                              src="${esc(
                                coverUrl
                              )}"
                              alt="${esc(
                                title
                              )}"
                              loading="lazy"
                              onerror="
                                this.style.display='none';
                                this.parentElement.classList.add('gallery-cover-error');
                              "
                            >

                          `
                          : `

                            <div
                              class="gallery-cover-placeholder"
                            >
                              
                            </div>

                          `
                      }


                      <div
                        class="gallery-album-overlay"
                      >

                        <span>
                          Open Album
                        </span>

                      </div>

                    </div>


                    <div
                      class="gallery-album-content"
                    >

                      <div
                        class="gallery-album-title-row"
                      >

                        <span
                          class="gallery-folder-icon"
                        >
                          
                        </span>


                        <h3>
                          ${esc(
                            title
                          )}
                        </h3>

                      </div>


                      <p
                        class="gallery-album-count"
                      >
                        ${esc(
                          mediaInfo
                        )}
                      </p>


                      ${
                        album.description
                          ? `

                            <p
                              class="gallery-album-description"
                            >
                              ${esc(
                                album.description
                              )}
                            </p>

                          `
                          : ''
                      }

                    </div>

                  </article>

                `;

              }
            )
            .join('')}

        </div>

      `;

    }


    /* =====================================================
       EVENTS
    ===================================================== */

    searchInput.addEventListener(
      'input',
      renderGallery
    );


    sortSelect.addEventListener(
      'change',
      renderGallery
    );


    renderGallery();

  } catch (error) {

    console.error(
      'Unable to load gallery:',
      error
    );


    layout(
      'gallery',
      `

        <h1>
          Gallery
        </h1>


        <div
          class="card"
        >

          <h3>
            Unable to load gallery
          </h3>


          <p>
            ${esc(
              error.message
            )}
          </p>


          <button
            onclick="gallery()"
          >
            Try Again
          </button>

        </div>

      `
    );

  }

}


/* =========================================================
   OPEN GALLERY ALBUM
========================================================= */

async function openGalleryAlbum(
  albumId
) {

  try {

    const numericAlbumId =
      Number(albumId);


    if (
      !Number.isInteger(
        numericAlbumId
      ) ||
      numericAlbumId <= 0
    ) {

      throw new Error(
        'Invalid gallery album.'
      );

    }


    const data =
      await get(
        `/gallery/${numericAlbumId}`
      );


    const album =
      data?.album ||
      {};


    const media =
      Array.isArray(
        data?.media
      )
        ? data.media
        : [];


    const title =
      album.title ||
      'Gallery';


    layout(
      'gallery',
      `

        <div
          class="page-header gallery-detail-header"
        >

          <button
            class="secondary"
            onclick="gallery()"
          >
            ← Back
          </button>


          <h1>
            ${esc(
              title
            )}
          </h1>

        </div>


        ${
          album.description
            ? `

              <div
                class="card gallery-detail-description"
              >

                <p>
                  ${esc(
                    album.description
                  )}
                </p>

              </div>

            `
            : ''
        }


        <div
          class="gallery-detail-count"
        >

          ${
            media.length
          }

          ${
            media.length === 1
              ? 'item'
              : 'items'
          }

        </div>


        ${
          !media.length
            ? `

              <div
                class="card"
              >

                <h3>
                  No media in this album
                </h3>


                <p>
                  This album does not contain
                  any photos or videos yet.
                </p>

              </div>

            `
            : `

              <div
                class="gallery-detail-grid"
              >

                ${media
                  .map(
                    item => {

                      const mediaUrl =
                        item.media_url ||
                        '';


                      const mediaType =
                        String(
                          item.media_type ||
                          ''
                        ).toLowerCase();


                      const fileName =
                        item.file_id ||
                        'Gallery media';


                      /* VIDEO */

                      if (
                        mediaType ===
                        'video'
                      ) {

                        return `

                          <article
                            class="card gallery-detail-card"
                          >

                            <div
                              class="gallery-media"
                            >

                              ${
                                mediaUrl
                                  ? `

                                    <video
                                      controls
                                      preload="metadata"
                                      playsinline
                                      src="${esc(
                                        mediaUrl
                                      )}"
                                    >

                                      Your browser does not
                                      support video playback.

                                    </video>

                                  `
                                  : `

                                    <div
                                      class="gallery-no-media"
                                    >
                                      Video unavailable
                                    </div>

                                  `
                              }

                            </div>

                          </article>

                        `;

                      }


                      /* IMAGE */

                      return `

                        <article
                          class="card gallery-detail-card"
                        >

                          <div
                            class="gallery-media"
                          >

                            ${
                              mediaUrl
                                ? `

                                  <img
                                    src="${esc(
                                      mediaUrl
                                    )}"
                                    alt="${esc(
                                      title
                                    )}"
                                    loading="lazy"
                                    onclick="viewGalleryMedia(
                                      '${esc(mediaUrl)}',
                                      '${esc(fileName)}',
                                      'image'
                                    )"
                                    onerror="
                                      this.style.display='none';
                                      this.parentElement.querySelector('.gallery-no-media').style.display='flex';
                                    "
                                  >

                                  <div
                                    class="gallery-no-media"
                                    style="display:none"
                                  >
                                    Image unavailable
                                  </div>

                                `
                                : `

                                  <div
                                    class="gallery-no-media"
                                  >
                                    Image unavailable
                                  </div>

                                `
                            }

                          </div>

                        </article>

                      `;

                    }
                  )
                  .join('')}

              </div>

            `

        }

      `
    );

  } catch (error) {

    console.error(
      'Unable to open gallery album:',
      error
    );


    layout(
      'gallery',
      `

        <div
          class="card"
        >

          <h3>
            Unable to open album
          </h3>


          <p>
            ${esc(
              error.message
            )}
          </p>


          <button
            onclick="gallery()"
          >
            Back to Gallery
          </button>

        </div>

      `
    );

  }

}


/* =========================================================
   GALLERY MEDIA VIEWER
========================================================= */

function viewGalleryMedia(
  url,
  title,
  type = 'image'
) {

  if (
    !url ||
    type !== 'image'
  ) {

    return;

  }


  const existing =
    document.querySelector(
      '#galleryLightbox'
    );


  if (
    existing
  ) {

    existing.remove();

  }


  const lightbox =
    document.createElement(
      'div'
    );


  lightbox.id =
    'galleryLightbox';


  lightbox.className =
    'gallery-lightbox';


  lightbox.innerHTML = `

    <div
      class="gallery-lightbox-backdrop"
      onclick="closeGalleryViewer()"
    ></div>


    <div
      class="gallery-lightbox-content"
    >

      <button
        class="gallery-lightbox-close"
        onclick="closeGalleryViewer()"
        aria-label="Close image"
      >
        ×
      </button>


      <img
        src="${esc(url)}"
        alt="${esc(title)}"
      >

    </div>

  `;


  document.body.appendChild(
    lightbox
  );

}


/* =========================================================
   CLOSE MEDIA VIEWER
========================================================= */

function closeGalleryViewer() {

  const lightbox =
    document.querySelector(
      '#galleryLightbox'
    );


  if (
    lightbox
  ) {

    lightbox.remove();

  }

}


/* =========================================================
   PROFILE
========================================================= */

async function profile() {

  if (!token) {

    return login();

  }

  try {

    const churchData =
      await get('/church_information');

    const churchInfo =
      Array.isArray(churchData)
        ? (churchData[0] || {})
        : Array.isArray(churchData?.church_information)
          ? (churchData.church_information[0] || {})
          : Array.isArray(churchData?.data)
            ? (churchData.data[0] || {})
            : (churchData || {});

    layout(
      'profile',
      `

        <h1>
          Profile
        </h1>


        <div
          class="card"
        >

          <h2>
            ${esc(
              member?.full_name ||
              'Member'
            )}
          </h2>


          <p>
            Member ID:
            ${esc(
              member?.member_id ||
              ''
            )}
          </p>


          <p>
            📱
            ${esc(
              member?.mobile ||
              ''
            )}
          </p>


          <p>
            📍
            ${esc(
              member?.address ||
              ''
            )}
          </p>

        </div>


        <div
          class="card church-information-card"
        >

          <h2>
            ⛪
            ${esc(
              churchInfo.title ||
              'Church Information'
            )}
          </h2>


          ${
            churchInfo.body
              ? `
                <p>
                  ${esc(churchInfo.body)}
                </p>
              `
              : ''
          }


          ${
            churchInfo.phone
              ? `
                <p>
                  📞
                  <a href="tel:${esc(churchInfo.phone)}">
                    ${esc(churchInfo.phone)}
                  </a>
                </p>
              `
              : ''
          }


          ${
            churchInfo.email
              ? `
                <p>
                  ✉️
                  <a href="mailto:${esc(churchInfo.email)}">
                    ${esc(churchInfo.email)}
                  </a>
                </p>
              `
              : ''
          }


          ${
            churchInfo.address
              ? `
                <p>
                  📍
                  ${esc(churchInfo.address)}
                </p>
              `
              : ''
          }


          ${
            churchInfo.website
              ? `
                <p>
                  🌐
                  <a
                    href="${esc(churchInfo.website)}"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Visit Church Website
                  </a>
                </p>
              `
              : ''
          }


          ${
            churchInfo.map_url
              ? `
                <p>
                  🗺️
                  <a
                    href="${esc(churchInfo.map_url)}"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open in Google Maps
                  </a>
                </p>
              `
              : ''
          }


          ${
            !churchInfo.body &&
            !churchInfo.phone &&
            !churchInfo.email &&
            !churchInfo.address &&
            !churchInfo.website &&
            !churchInfo.map_url
              ? `
                <p>
                  Church information has not been added yet.
                </p>
              `
              : ''
          }

        </div>

      `
    );

  } catch (error) {

    console.error(
      'Unable to load church information:',
      error
    );

    layout(
      'profile',
      `

        <h1>
          Profile
        </h1>


        <div class="card">

          <h2>
            ${esc(
              member?.full_name ||
              'Member'
            )}
          </h2>

          <p>
            Member ID:
            ${esc(
              member?.member_id ||
              ''
            )}
          </p>

          <p>
            📱
            ${esc(
              member?.mobile ||
              ''
            )}
          </p>

          <p>
            📍
            ${esc(
              member?.address ||
              ''
            )}
          </p>

        </div>


        <div class="card">

          <h3>
            Church Information
          </h3>

          <p>
            Unable to load church information.
          </p>

          <button
            onclick="profile()"
          >
            Try Again
          </button>

        </div>

      `
    );

  }

}


/* =========================================================
   LOGIN
========================================================= */

async function login(
  forceRegister = false
) {

  try {

    const mobile =
      prompt(
        'Mobile number'
      );


    if (!mobile) {
      return;
    }


    const otpResponse =
      await fetch(
        API +
        '/auth/member/request-otp',
        {
          method:
            'POST',

          headers: {
            'Content-Type':
              'application/json'
          },

          body:
            JSON.stringify({
              mobile
            })

        }
      );


    const otpData =
      await otpResponse
        .json()
        .catch(() => ({}));


    if (
      !otpResponse.ok
    ) {

      throw new Error(
        otpData.message ||
        'Unable to send OTP'
      );

    }


    const otp =
      prompt(
        'Enter OTP. In development, it appears in the API console.'
      );


    if (!otp) {
      return;
    }


    const response =
      await fetch(
        API +
        '/auth/member/verify-otp',
        {
          method:
            'POST',

          headers: {
            'Content-Type':
              'application/json'
          },

          body:
            JSON.stringify({
              mobile,
              otp
            })

        }
      );


    const data =
      await response.json();


    if (!response.ok) {

      throw new Error(
        data.message ||
        'Login failed'
      );

    }


    if (
      data.registered
    ) {

      token =
        data.token;


      member =
        data.member;


      localStorage.memberToken =
        token;


      localStorage.member =
        JSON.stringify(
          member
        );


      home();

    } else {

      const ok =
        confirm(
          'Number not registered. Register now?'
        );


      if (ok) {

        register(
          mobile
        );

      }

    }

  } catch (error) {

    alert(
      error.message
    );

  }

}


/* =========================================================
   REGISTER
========================================================= */

function register(
  mobile = ''
) {

  layout(
    '',
    `

      <h1>
        Register
      </h1>


      <div
        class="card"
      >

        <label>

          Full name

          <input
            id="rn"
            placeholder="Full name"
          >

        </label>


        <label>

          Mobile

          <input
            id="rm"
            value="${esc(
              mobile
            )}"
          >

        </label>


        <label>

          Date of birth

          <input
            id="rd"
            type="date"
          >

        </label>


        <label>

          Gender

          <select
            id="rs"
          >

            <option
              value=""
            >
              Select
            </option>


            <option>
              Male
            </option>


            <option>
              Female
            </option>


            <option>
              Other
            </option>

          </select>

        </label>


        <label>

          House / Door no

          <input
            id="rh"
          >

        </label>


        <label>

          Street

          <input
            id="rst"
          >

        </label>


        <label>

          Area / Village

          <input
            id="ra"
          >

        </label>


        <label>

          City / Town

          <input
            id="rc"
          >

        </label>


        <label>

          District

          <input
            id="rdi"
          >

        </label>


        <label>

          State

          <input
            id="rstate"
            value="Tamil Nadu"
          >

        </label>


        <label>

          PIN

          <input
            id="rp"
          >

        </label>


        <button
          onclick="doRegister()"
        >
          Register
        </button>

      </div>

    `
  );

}


/* =========================================================
   DO REGISTER
========================================================= */

async function doRegister() {

  try {

    const body = {

      full_name:
        document.querySelector(
          '#rn'
        ).value,


      mobile:
        document.querySelector(
          '#rm'
        ).value,


      dob:
        document.querySelector(
          '#rd'
        ).value,


      sex:
        document.querySelector(
          '#rs'
        ).value,


      house_no:
        document.querySelector(
          '#rh'
        ).value,


      street:
        document.querySelector(
          '#rst'
        ).value,


      area:
        document.querySelector(
          '#ra'
        ).value,


      city:
        document.querySelector(
          '#rc'
        ).value,


      district:
        document.querySelector(
          '#rdi'
        ).value,


      state:
        document.querySelector(
          '#rstate'
        ).value,


      pin:
        document.querySelector(
          '#rp'
        ).value,


      address: [

        document.querySelector(
          '#rh'
        ).value,


        document.querySelector(
          '#rst'
        ).value,


        document.querySelector(
          '#ra'
        ).value,


        document.querySelector(
          '#rc'
        ).value,


        document.querySelector(
          '#rdi'
        ).value,


        document.querySelector(
          '#rstate'
        ).value,


        document.querySelector(
          '#rp'
        ).value

      ]
        .filter(Boolean)
        .join(', ')

    };


    const response =
      await fetch(
        API +
        '/auth/member/register',
        {
          method:
            'POST',

          headers: {
            'Content-Type':
              'application/json'
          },

          body:
            JSON.stringify(
              body
            )

        }
      );


    const data =
      await response.json();


    if (!response.ok) {

      throw new Error(
        data.message ||
        'Registration failed'
      );

    }


    alert(
      `Registered successfully.\nMember ID: ${data.member_id}`
    );


    login();

  } catch (error) {

    alert(
      error.message
    );

  }

}


/* =========================================================
   LOGOUT
========================================================= */

function logout() {

  token = '';

  member = null;


  localStorage.removeItem(
    'memberToken'
  );


  localStorage.removeItem(
    'member'
  );


  home();

}


/* =========================================================
   START APP
========================================================= */

home();
