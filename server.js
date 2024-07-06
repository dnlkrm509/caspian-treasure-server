// server/server.js
import cors from 'cors';
import express from 'express';
import Stripe from 'stripe';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import mysql from 'mysql2/promise';

// Configure dotenv immediately after importing
dotenv.config();


const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
//app.use(express.static('images'));
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Welcome to the Caspian Treasure API');
});

const allowedOrigins = ['https://zingy-twilight-e56255.netlify.app'];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  }
}));

// Additional headers middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});


async function main() {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    port: process.env.MYSQL_PORT
  });

  return connection;
}

app.get('/products', async (req, res) => {
  const q1 = 'CREATE TABLE IF NOT EXISTS products (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255) NOT NULL UNIQUE, description VARCHAR(255) NOT NULL, price DECIMAL(6, 2) NOT NULL)';
  const q2 = 'SELECT * FROM products';
 
  const connection = await main();
  try{
    await connection.execute(q1);
    const [rows, fields] = await connection.execute(q2);
    res.status(200).json({rows});
  } catch (err) {
    console.error('Error fetching data:', err.stack);
    res.status(500).json({err});
  } finally {
    await connection.end();
  }
});

app.get('/cart-products', async (req, res) => {
  const q = 'CREATE TABLE IF NOT EXISTS carts (id INT AUTO_INCREMENT PRIMARY KEY, product_id INT NOT NULL, name VARCHAR(255) NOT NULL UNIQUE, description VARCHAR(255) NOT NULL, amount INT NOT NULL, price DECIMAL(6, 2) NOT NULL, UID VARCHAR(36) NOT NULL, totalAmount DECIMAL(8, 2) DEFAULT 0 NOT NULL)';
  const q1 = `
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
  );
`;

  const q2 = 'SELECT * FROM carts';

  const connection = await main();
  
  try{
    await connection.execute(q);
    await connection.execute(q1);
    const [rows, fields] = await connection.execute(q2);
    res.status(200).json({rows});
  } catch (err) {
    console.error('Error fetching data:', err.stack);
    res.status(500).json({err});
  } finally {
    await connection.end();
  }

});

app.post('/cart-products', async (req, res) => {
  const { newProduct, cart, totalAmount } = req.body;

  const connection = await main();

  const query = 'INSERT IGNORE INTO carts (product_id, name, description, amount, price, UID, totalAmount) VALUES (?, ?, ?, ?, ?, ?, ?)';
  const values = [ newProduct.product_id, newProduct.name, newProduct.description, newProduct.amount, newProduct.price ];

  try {
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
    await connection.end();
  }
  
});

app.put('/cart-products/:id', async (req, res) => {
  const productId = req.params.id;
  const { newProduct, totalAmount } = req.body;

  const connection = await main();

  const query = 'UPDATE carts SET amount = ?, totalAmount = ? WHERE product_id = ?';
  const query1 = 'UPDATE carts SET totalAmount = ? WHERE product_id = ?';
  const q = 'SELECT * FROM carts';

  try {
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
    await connection.end();
  }

});

app.delete('/cart-products/:id', async (req, res) => {
  const productId = req.params.id;

  const connection = await main();

  const q1 = 'DELETE FROM carts WHERE product_id = ?';
  const q2 = 'SELECT * FROM carts';

   try {
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
     await connection.end();
   }
})

app.post('/message-from', async (req, res) => {
  const { data } = req.body;

  const connection = await main();

  const q1 = 'CREATE TABLE IF NOT EXISTS message_from (id INT AUTO_INCREMENT PRIMARY KEY, subject VARCHAR(255) NOT NULL, from_name VARCHAR(255) NOT NULL, from_email VARCHAR(255) NOT NULL, message VARCHAR(255) NOT NULL)';
  const q2 = 'INSERT INTO message_from (subject, from_name, from_email, message) VALUES (?, ?, ?, ?)';
  const values = [ data.subject, data.from_name, data.from_email, data.message ];

  try {
    await connection.execute(q1);
    const [result] = await connection.execute(q2, values);
    console.log('Data inserted:', result);

    res.status(200).json({ message: 'Message sent!' });
  } catch (err) {
    console.error('Error sending message:', err.stack);
    res.status(500).json({ message: 'Failed to send message!' });
  } finally {
    await connection.end();
  }
  
});

const isValidEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
};

app.post('/checkout', async (req, res) => {
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

app.get('/orders', async (req, res) => {
  const q = 'SELECT * FROM orders';

  const connection = await main();
  
  try{
    const [rows, fields] = await connection.execute(q);
    res.status(200).json({rows});
  } catch (err) {
    console.error('Error fetching orders:', err.stack);
    res.status(500).json({err});
  } finally {
    await connection.end();
  }

});

app.post('/orders', async (req, res) => {
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

  const connection = await main();

  const query = 'INSERT INTO orders (product_id, product_name, description, amount, price, customer_name, customer_email, customer_address, customer_city, customer_state, customer_zip, customer_country, order_id, totalAmount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
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
    const [result] = await connection.execute(query, [...values, orderId ? orderId : uuidv4(), totalAmount]);
    console.log('Data inserted:', result);
    
    res.status(200).json({ message: 'Cart product/(s) added!' });
  } catch (err) {
    console.error('Error inserting data:', err.stack);
    res.status(500).json({ message: 'Failed to add product/(s) to cart!' });
  } finally {
    await connection.end();
  }
  
});

app.delete('/all-cart-products/:id', async (req, res) => {
  const productId = req.params.id;

  const connection = await main();

  const q1 = 'DELETE FROM carts WHERE product_id = ?';
  const q2 = 'SELECT * FROM carts';

   try {
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
     await connection.end();
   }
})

// 404
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    return next();
  }
  res.status(404).json({ message: '404 - Not Found' });
});

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