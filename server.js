const express = require('express');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

console.log(123123, process.env, process.env.NODE_ENV)
// nuclear CORS fix (DEV ONLY)
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
    } else {
      next();
    }
  });
}

app.use(express.json());

// IGDB Service class for backend
class IGDBService {
  constructor() {
    this.clientId = process.env.IGDB_CLIENT_ID;
    this.clientSecret = process.env.IGDB_CLIENT_SECRET;
    this.baseURL = 'https://api.igdb.com/v4';
    this.tokenURL = 'https://id.twitch.tv/oauth2/token';
    this.token = null;
    this.tokenExpiry = null;
  }

  async getAccessToken() {
    const response = await fetch(this.tokenURL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'client_credentials'
      })
    });

    if (!response.ok) {
      throw new Error('Failed to get access token');
    }

    const data = await response.json();
    this.token = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    
    return this.token;
  }

  async ensureValidToken() {
    if (!this.token || Date.now() >= this.tokenExpiry) {
      await this.getAccessToken();
    }
    return this.token;
  }

  async makeRequest(endpoint, query = '') {
    await this.ensureValidToken();

    const response = await fetch(`${this.baseURL}/${endpoint}`, {
      method: 'POST',
      headers: {
        'Client-ID': this.clientId,
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: query
    });

    if (!response.ok) {
      throw new Error(`IGDB API request failed: ${response.statusText}`);
    }

    return response.json();
  }
}

const igdbService = new IGDBService();

app.post('/api/games/search', async (req, res) => {
  try {
    const { searchTerm, limit = 10, categoryIds = [] } = req.body;

    let query = `search "${searchTerm}";`;

    if (categoryIds && categoryIds.length > 0) {
      query += ` where category = (${categoryIds.join(',')});`;
    }
    
    query += ` fields name, cover.url, first_release_date, rating, summary, genres.name, platforms.name, platforms.abbreviation, platforms.category, category, total_rating, aggregated_rating;`;
    query += ` limit ${limit};`;
    
    const results = await igdbService.makeRequest('games', query);
    res.json(results);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/games/popular', async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    
    const query = `
      fields name, cover.url, first_release_date, rating;
      sort rating desc;
      where rating > 80 & first_release_date != null;
      limit ${limit};
    `;
    
    const results = await igdbService.makeRequest('games', query);
    res.json(results);
  } catch (error) {
    console.error('Popular games error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/games/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const query = `
      fields name, cover.url, first_release_date, rating, summary, genres.name, platforms.name, screenshots.url;
      where id = ${id};
    `;
    
    const results = await igdbService.makeRequest('games', query);
    res.json(results);
  } catch (error) {
    console.error('Get game error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/igdb/:endpoint', async (req, res) => {
  try {
    const { endpoint } = req.params;
    const { query } = req.body;
    
    const results = await igdbService.makeRequest(endpoint, query);
    res.json(results);
  } catch (error) {
    console.error('Custom query error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/popularity_primitives', async (req, res) => {
  try {
    const { query } = req.body;
    
    const results = await igdbService.makeRequest('popularity_primitives', query);
    res.json(results);
  } catch (error) {
    console.error('Popularity primitives error:', error);
    res.status(500).json({ error: error.message });
  }
});


// app.get('/api/popularity_primitives', async (req, res) => {
//   try {
//     const { limit = 50, offset = 0, fields = 'game_id,popularity_type,value' } = req.query;
    
//     const query = `
//       fields ${fields};
//       limit ${limit};
//       offset ${offset};
//       sort value desc;
//     `;
    
//     const results = await igdbService.makeRequest('popularity_primitives', query);
//     res.json(results);
//   } catch (error) {
//     console.error('Popularity primitives error:', error);
//     res.status(500).json({ error: error.message });
//   }
// });

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;