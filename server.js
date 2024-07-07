// server/server.js
import cors from 'cors';
import express from 'express';
import Stripe from 'stripe';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import mysql from 'mysql2/promise';

// Configure dotenv immediately after importing
dotenv.config();

let pool;
function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.MYSQL_HOST,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      port: process.env.MYSQL_PORT,
      ssl: {
        rejectUnauthorized: true
      },
      connectionLimit: 35,  // Set an appropriate connection limit
      queueLimit: 0
    });
  }
  return pool;
}

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
//app.use(express.static('images'));
app.use(express.json());

const allowedOrigins = ['https://zingy-twilight-e56255.netlify.app'];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', allowedOrigins.join(','));
  res.header('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});

async function initializeDatabase() {
  const q = `
  CREATE TABLE IF NOT EXISTS products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    description VARCHAR(255) NOT NULL,
    price DECIMAL(6, 2) NOT NULL
  )`;

  const q1 = `
  CREATE TABLE IF NOT EXISTS carts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    name VARCHAR(255) NOT NULL UNIQUE,
    description VARCHAR(255) NOT NULL,
    amount INT NOT NULL,
    price DECIMAL(6, 2) NOT NULL,
    UID VARCHAR(36) NOT NULL,
    totalAmount DECIMAL(8, 2) DEFAULT 0 NOT NULL
  )`;

  const q2 = `
  CREATE TABLE IF NOT EXISTS orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    description VARCHAR(255) NOT NULL,
    amount INT NOT NULL,
    price DECIMAL(6, 2) NOT NULL,
    customer_name VARCHAR(255) NOT NULL,
    customer_email VARCHAR(255) NOT NULL DEFAULT 'example@example.com',
    customer_address VARCHAR(255) NOT NULL,
    customer_city VARCHAR(255) NOT NULL,
    customer_state VARCHAR(255) NOT NULL,
    customer_zip VARCHAR(255) NOT NULL,
    customer_country VARCHAR(255) NOT NULL,
    order_id VARCHAR(36) NOT NULL DEFAULT '123',
    totalAmount DECIMAL(8, 2) NOT NULL DEFAULT 0
  )`;

  const q3 = `
  CREATE TABLE IF NOT EXISTS message_from (
    id INT AUTO_INCREMENT PRIMARY KEY,
    subject VARCHAR(255) NOT NULL,
    from_name VARCHAR(255) NOT NULL,
    from_email VARCHAR(255) NOT NULL,
    message VARCHAR(255) NOT NULL
  )`;

  const q4 = `
  CREATE TABLE IF NOT EXISTS message_to (
    id INT AUTO_INCREMENT PRIMARY KEY,
    subject VARCHAR(255) NOT NULL,
    customer_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL DEFAULT 'example@example.com',
    order_id VARCHAR(36) NOT NULL DEFAULT '123',
    address VARCHAR(255) NOT NULL,
    city VARCHAR(255) NOT NULL,
    state VARCHAR(255) NOT NULL,
    zip VARCHAR(255) NOT NULL,
    country VARCHAR(255) NOT NULL,
    product_id INT NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    amount INT NOT NULL,
    price DECIMAL(6, 2) NOT NULL,
    totalAmount DECIMAL(8, 2) NOT NULL DEFAULT 0
  )`;
  
  let connection;
  try {
    connection = await getPool().getConnection();
    await connection.execute(q);
    await connection.execute(q1);
    await connection.execute(q2);
    await connection.execute(q3);
    await connection.execute(q4);
  } catch (err) {
    console.error('Error initializing database:', err.stack);
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

app.get('/', (req, res) => {
  res.send('Welcome to the Caspian Treasure API');
});

app.get('/api/products', async (req, res) => {  
  const q = 'SELECT * FROM products';
 
  let connection;
  try{
    connection = await getPool().getConnection();
    const [rows, fields] = await connection.execute(q);
    res.status(200).json({rows});
  } catch (err) {
    console.error('Error fetching data:', err.stack);
    res.status(500).json({err});
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

app.get('/api/cart-products', async (req, res) => {
  const q = 'SELECT * FROM carts';

  let connection;
  
  try{
    connection = await getPool().getConnection();
    const [rows, fields] = await connection.execute(q);
    res.status(200).json({rows});
  } catch (err) {
    console.error('Error fetching data:', err.stack);
    res.status(500).json({err});
  } finally {
    if (connection) {
      connection.release();
    }
  }

});

app.post('/api/cart-products', async (req, res) => {
  const { newProduct, cart, totalAmount } = req.body;

  let connection;

  const query = `
  INSERT IGNORE INTO carts (
    product_id,
    name,
    description,
    amount,
    price,
    UID,
    totalAmount
  )
  VALUES (?, ?, ?, ?, ?, ?, ?)`;
  const values = [
    newProduct.product_id,
    newProduct.name,
    newProduct.description,
    newProduct.amount,
    newProduct.price
  ];

  try {
    connection = await getPool().getConnection();
    if (cart) {
      const [result] = await connection.execute(query, [...values, cart.UID, totalAmount]);
      console.log('Data inserted:', result);
    } else {
      const [result] = await connection.execute(query, [...values, uuidv4(), totalAmount]);
      console.log('Data inserted:', result);
    }
    
    res.status(200).json({ message: 'Cart product/(s) added!' });
  } catch (err) {
    console.error('Error inserting data:', err.stack);
    res.status(500).json({ message: 'Failed to add product/(s) to cart!' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
  
});

app.put('/api/cart-products/:id', async (req, res) => {
  const productId = req.params.id;
  const { newProduct, totalAmount } = req.body;

  let connection;

  const query = 'UPDATE carts SET amount = ?, totalAmount = ? WHERE product_id = ?';
  const query1 = 'UPDATE carts SET totalAmount = ? WHERE product_id = ?';
  const q = 'SELECT * FROM carts';

  try {
    connection = await getPool().getConnection();
    if (newProduct) {
      const [result] = await connection.execute(query, [ newProduct.amount, totalAmount, productId ]);
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Product not found' });
      }
      console.log('Product updated successfully: ', result);
    } else {
      const [result] = await connection.execute(query1, [ totalAmount, productId ]);
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Product not found' });
      }
      console.log('Product updated successfully: ', result);
    }
    
    const [rows, fields] = await connection.execute(q);
    res.status(200).json({rows});
  } catch (err) {
    console.error('Error updating data:', err.stack);
    res.status(500).json({ message: 'Internal Server Error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }

});

app.delete('/api/cart-products/:id', async (req, res) => {
  const productId = req.params.id;

  let connection;

  const q1 = 'DELETE FROM carts WHERE product_id = ?';
  const q2 = 'SELECT * FROM carts';

   try {
    connection = await getPool().getConnection();
     const [result] = await connection.execute(q1, [productId]);
     if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Product not found' });
     }  

     console.log('Data deleted:', result);
     const [rows, fields] = await connection.execute(q2);
     res.status(200).json({rows});
   } catch (err) {
     console.error('Error deleting data:', err.stack);
     res.status(500).json({ message: 'Internal Server Error' });
   } finally {
    if (connection) {
      connection.release();
    }
   }
})

app.post('/api/message-from', async (req, res) => {
  const { data } = req.body;

  let connection;

  
  const q = 'INSERT INTO message_from (subject, from_name, from_email, message) VALUES (?, ?, ?, ?)';
  const values = [ data.subject, data.from_name, data.from_email, data.message ];

  try {
    connection = await getPool().getConnection();
    const [result] = await connection.execute(q, values);
    console.log('Data inserted:', result);

    res.status(200).json({ message: 'Message sent!' });
  } catch (err) {
    console.error('Error sending message:', err.stack);
    res.status(500).json({ message: 'Failed to send message!' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
  
});

const isValidEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
};

app.post('/api/checkout', async (req, res) => {
  const { count, amount, name, email, address, city, state, zip, country, currency } = req.body;

  if (!isValidEmail(email) && count !== 0) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: currency,
      payment_method_types: ['card', 'paypal', 'bacs_debit'],
      receipt_email: email,
      shipping: {
        name,
        address: {
          line1: address,
          city,
          state,
          postal_code: zip,
          country
        }
      },
      metadata: {
        customer_name: name,
        customer_email: email
      }
    });

    res.status(200).json({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    console.error('Error creating payment intent:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/orders', async (req, res) => {
  const q = 'SELECT * FROM orders';

  let connection;
  
  try{
    connection = await getPool().getConnection();
    const [rows, fields] = await connection.execute(q);
    res.status(200).json({rows});
  } catch (err) {
    console.error('Error fetching orders:', err.stack);
    res.status(500).json({err});
  } finally {
    if (connection) {
      connection.release();
    }
  }

});

app.post('/api/orders', async (req, res) => {
  const {
    newProduct,
    orderId,
    name,
    email,
    address,
    city,
    state,
    zip,
    country,
    totalAmount } = req.body;

  let connection;

  const query = `
  INSERT INTO orders (
    product_id,
    product_name,
    description,
    amount,
    price,
    customer_name,
    customer_email,
    customer_address,
    customer_city,
    customer_state,
    customer_zip,
    customer_country,
    order_id,
    totalAmount
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const values = [
    newProduct.product_id,
    newProduct.name,
    newProduct.description,
    newProduct.amount,
    newProduct.price,
    name,
    email,
    address,
    city,
    state,
    zip,
    country
  ];

  try {
    connection = await getPool().getConnection();
    const [result] = await connection.execute(query, [...values, orderId ? orderId : uuidv4(), totalAmount]);
    console.log('Data inserted:', result);
    
    res.status(200).json({ message: 'Cart product/(s) added!' });
  } catch (err) {
    console.error('Error inserting data:', err.stack);
    res.status(500).json({ message: 'Failed to add product/(s) to cart!' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
  
});

app.post('/api/message-to', async (req, res) => {
  const {
    name,
    email,
    orderId,
    address,
    city,
    state,
    zip,
    product_id,
    productName,
    amount,
    price,
    totalAmount
  } = req.body;

  let connection;

  const q = `
  INSERT INTO message_to (
    subject,
    customer_name,
    email,
    order_id,
    address,
    city,
    state,
    zip,
    country,
    product_id,
    product_name,
    amount,
    price,
    totalAmount
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const values = [
    `Order Confirmation`,
    name,
    email,
    orderId,
    address,
    city,
    state,
    zip,
    product_id,
    productName,
    amount,
    price,
    totalAmount
  ];

  try {
    connection = await getPool().getConnection();
    const [result] = await connection.execute(q, values);
    console.log('Data inserted:', result);

    res.status(200).json({ message: 'Message sent!' });
  } catch (err) {
    console.error('Error sending message:', err.stack);
    res.status(500).json({ message: 'Failed to send message!' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
  
});

app.delete('/api/all-cart-products/:id', async (req, res) => {
  const productId = req.params.id;

  let connection;

  const q1 = 'DELETE FROM carts WHERE product_id = ?';
  const q2 = 'SELECT * FROM carts';

   try {
    connection = await getPool().getConnection();
     const [result] = await connection.execute(q1, [productId]);
     if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Product not found' });
     }

     console.log('Data deleted:', result);
     const [rows, fields] = await connection.execute(q2);
     res.status(200).json({rows});
   } catch (err) {
     console.error('Error deleting data:', err.stack);
     res.status(500).json({ message: 'Internal Server Error' });
   } finally {
    if (connection) {
      connection.release();
    }
   }
})

initializeDatabase().then(() => {
  const PORT = process.env.PORT || 5000;
  const server = app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Please use a different port.`);
      process.exit(1);
    } else {
      console.error('Server error:', err);
    }
  });
});