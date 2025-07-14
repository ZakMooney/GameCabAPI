const express = require('express');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

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

  // async makeRequest(endpoint, query = '') {
  //   await this.ensureValidToken();

  //   const response = await fetch(`${this.baseURL}/${endpoint}`, {
  //     method: 'POST',
  //     headers: {
  //       'Client-ID': this.clientId,
  //       'Authorization': `Bearer ${this.token}`,
  //       'Content-Type': 'application/json'
  //     },
  //     body: query
  //   });

  //   if (!response.ok) {
  //     throw new Error(`IGDB API request failed: ${response.statusText}`);
  //   }

  //   return response.json();
  // }

  async makeRequest(endpoint, query = '') {
    await this.ensureValidToken();
  
    console.log(`Making request to: ${this.baseURL}/${endpoint}`);
    console.log(`Query: ${query}`);
  
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
      const errorText = await response.text();
      console.error(`IGDB API Error: ${response.status} - ${response.statusText}`);
      console.error(`Error details: ${errorText}`);
      throw new Error(`IGDB API request failed: ${response.statusText} - ${errorText}`);
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

app.get('/api/games/most-played', async (req, res) => {
  try {
    const { limit = 12 } = req.query;

    const popularityQuery = `fields game_id, value; where popularity_type = 4; limit ${limit}; sort value desc;`;
    
    const popularityData = await igdbService.makeRequest('popularity_primitives', popularityQuery);
    
    if (popularityData.length === 0) {
      return res.json([]);
    }
    
    const gameIds = popularityData.map(item => item.game_id);
    const gameDetailsQuery = `fields name, cover.url, first_release_date, rating, summary, genres.name, platforms.name, platforms.abbreviation, platforms.category, category, total_rating, aggregated_rating; where id = (${gameIds.join(',')});`;
    
    const gameDetails = await igdbService.makeRequest('games', gameDetailsQuery);

    const combinedResults = popularityData.map(popItem => {
      const gameDetail = gameDetails.find(game => game.id === popItem.game_id);
      return {
        game_id: popItem.game_id,
        popularity_value: popItem.value,
        game: gameDetail || null
      };
    }).filter(item => item.game !== null);
    
    res.json(combinedResults);
  } catch (error) {
    console.error('Most played games error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/games/by-ids', async (req, res) => {
  try {
    const { gameIds } = req.body;
    
    if (!gameIds || !Array.isArray(gameIds) || gameIds.length === 0) {
      return res.status(400).json({ error: 'gameIds array is required' });
    }
    
    const query = `fields name, cover.url, first_release_date, rating, summary, genres.name, platforms.name, platforms.abbreviation, platforms.category, category, total_rating, aggregated_rating; where id = (${gameIds.join(',')});`;
    
    const results = await igdbService.makeRequest('games', query);

    const sortedResults = gameIds.map(id => results.find(game => game.id === id)).filter(Boolean);

    res.json(sortedResults);
  } catch (error) {
    console.error('Get games by IDs error:', error);
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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;