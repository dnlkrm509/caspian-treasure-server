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
    description TEXT NOT NULL,
    price DECIMAL(6, 2) NOT NULL
  );`;

  const q1 = `
  CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    password VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL DEFAULT 'example@example.com',
    address VARCHAR(255) NOT NULL,
    city VARCHAR(255) NOT NULL,
    state VARCHAR(255) NOT NULL,
    zip VARCHAR(255) NOT NULL,
    country VARCHAR(255) NOT NULL
  );`;

  const q2 = `
  CREATE TABLE IF NOT EXISTS carts (
    product_id INT NOT NULL,
    user_id INT NOT NULL,
    amount INT NOT NULL,
    totalAmount DECIMAL(7, 2) DEFAULT 0,
    FOREIGN KEY(product_id) REFERENCES products(id),
    FOREIGN KEY(user_id) REFERENCES users(id),
    PRIMARY KEY(product_id, user_id)
  );`;

  const q3 = `
  CREATE TABLE IF NOT EXISTS customers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );`;

  const q4 = `
  CREATE TABLE IF NOT EXISTS orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    confirmation VARCHAR(36) NOT NULL,
    FOREIGN KEY(customer_id) REFERENCES customers(id)
  );`;

  const q5 = `
  CREATE TABLE IF NOT EXISTS order_detail (
    order_id INT NOT NULL,
    product_id INT NOT NULL,
    FOREIGN KEY(order_id) REFERENCES orders(id),
    FOREIGN KEY(product_id) REFERENCES products(id)
  );`;

  const q6 = `
  CREATE TABLE IF NOT EXISTS message_from (
    id INT AUTO_INCREMENT PRIMARY KEY,
    subject VARCHAR(255) NOT NULL,
    from_name VARCHAR(255) NOT NULL,
    from_email VARCHAR(255) NOT NULL,
    message VARCHAR(255) NOT NULL
  );`;

  const q7 = `
  CREATE TABLE IF NOT EXISTS message_to (
    subject VARCHAR(255) NOT NULL,
    customer_id INT NOT NULL,
    product_id INT NOT NULL,
    FOREIGN KEY(product_id) REFERENCES products(id),
    FOREIGN KEY(customer_id) REFERENCES users(id),
    PRIMARY KEY(product_id, customer_id)
  );`;
  
  let connection;
  try {
    connection = await getPool().getConnection();
    await connection.execute(q);
    await connection.execute(q1);
    await connection.execute(q2);
    await connection.execute(q3);
    await connection.execute(q4);
    await connection.execute(q5);
    await connection.execute(q6);
    await connection.execute(q7);
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
  
  const q = `
  SELECT users.id as user_id,
    products.id as product_id, products.name, products.description, products.price,
    carts.amount, carts.totalAmount
    FROM carts
    INNER JOIN users ON
    carts.user_id = users.id
    INNER JOIN products ON
    carts.product_id = products.id
  `;

  let connection;
  
  try{
    connection = await getPool().getConnection();
    const [rows, fields] = await connection.execute(q);
    
    if (rows.length === 0) {
      return res.status(200).json({ rows: [] });
    }

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

app.get('/api/users', async (req, res) => {
  const q = 'SELECT * FROM users';

  let connection;
  
  try{
    connection = await getPool().getConnection();
    const [rows, fields] = await connection.execute(q);
    if (rows.length === 0) {
      return res.status(200).json({ rows: [] });
    }
    res.status(200).json({rows});
  } catch (err) {
    console.error('Error fetching users:', err.stack);
    res.status(500).json({err});
  } finally {
    if (connection) {
      connection.release();
    }
  }

});

app.post('/api/users', async (req, res) => {
  const { name, password, email, address, city, state, zip, country } = req.body;

  let connection;

  const query = `
  INSERT INTO users (
    name,
    password,
    email,
    address,
    city,
    state,
    zip,
    country
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
  const userValues = [
    name,
    password,
    email,
    address,
    city,
    state,
    zip,
    country
  ];
  

  try {
    connection = await getPool().getConnection();
    
    const [result] = await connection.execute(query, userValues);
    console.log('Data inserted:', result);
    
    res.status(200).json({ message: 'user added!' });
  } catch (err) {
    console.error('Error inserting new user:', err.stack);
    res.status(500).json({ message: 'Failed to add new user!' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
  
});

app.post('/api/cart-products', async (req, res) => {
  const { newProduct, userId, user, cart, totalAmount } = req.body;
  
  // Check if newProduct is an array or not properly structured
  if (!newProduct) {
    return res.status(400).json({ message: 'Invalid request. newProduct must be a non-empty array.' });
  }

  // Extract product_id and amount from the newProduct
  const productIdValue = newProduct.product_id;
  const amountValue = newProduct.amount;
  const totalAmountValue = totalAmount;
  const userIdValue = userId ? userId : user.id;

  // If amountValue is 0, do nothing and silently exit
  if (amountValue === 0 && cart) {
    return res.status(200).json({ message: 'No action taken as amount is 0.' });
  }

  // Check for missing required fields (specifically checking for undefined or null)
  if (productIdValue === undefined || productIdValue === null || 
    amountValue === undefined || amountValue === null || 
    userIdValue === undefined || userIdValue === null || 
    totalAmountValue === undefined || totalAmountValue === null) {
  return res.status(400).json({ message: 'Invalid request. Missing required fields.' });
}

  let connection;

  const insertQuery = `
      INSERT IGNORE INTO carts (user_id, product_id, amount, totalAmount)
      VALUES (?, ?, ?, ?)`;

  try {
    connection = await getPool().getConnection();
    
    await connection.execute(insertQuery, [userIdValue, productIdValue, amountValue, totalAmountValue]);
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
  const { newProduct, userId, totalAmount } = req.body;

  let connection;

  const query = 'UPDATE carts SET amount = ?, totalAmount = ? WHERE product_id = ? AND user_id = ?';
  const query1 = 'UPDATE carts SET totalAmount = ? WHERE product_id = ? AND user_id = ?';
  const q = `
  SELECT users.id as user_id,
    products.id as product_id, products.name, products.description, products.price,
    carts.amount, carts.totalAmount
    FROM carts
    INNER JOIN users ON
    carts.user_id = users.id
    INNER JOIN products ON
    carts.product_id = products.id
    WHERE carts.user_id = ?
  `;

  try {
    connection = await getPool().getConnection();
    if (newProduct) {
      const [result] = await connection.execute(query, [ newProduct.amount, totalAmount, productId, userId ]);
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Product not found' });
      }
      console.log('Product updated successfully: ', result);
    } else {
      const [result] = await connection.execute(query1, [ totalAmount, productId, userId ]);
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Product not found' });
      }
      console.log('Product updated successfully: ', result);
    }
    
    const [rows, fields] = await connection.execute(q, [ userId ]);
    if (rows.length === 0) {
      return res.status(200).json({ rows: [] });
    }
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
  const { userId } = req.body;

  let connection;

  const q1 = 'DELETE FROM carts WHERE product_id = ? AND user_id = ?';
  const q2 = `
  SELECT users.id as user_id,
    products.id as product_id, products.name, products.description, products.price,
    carts.amount, carts.totalAmount
    FROM carts
    INNER JOIN users ON
    carts.user_id = users.id
    INNER JOIN products ON
    carts.product_id = products.id
    WHERE carts.user_id = ?
  `;

   try {
    connection = await getPool().getConnection();
     const [result] = await connection.execute(q1, [productId, userId]);
     if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Product not found' });
     }  

     console.log('Data deleted:', result);
     const [rows, fields] = await connection.execute(q2, [userId]);
     if (rows.length === 0) {
      return res.status(200).json({ rows: [] });
    }
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

  
  const q = `
  INSERT INTO message_from (
    subject,
    from_name,
    from_email,
    message
  )
  VALUES (?, ?, ?, ?)`;
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

app.get('/api/customers', async (req, res) => {
  const q = 'SELECT * FROM customers';

  let connection;
  
  try{
    connection = await getPool().getConnection();
    const [rows, fields] = await connection.execute(q);
    if (rows.length === 0) {
      return res.status(200).json({ rows: [] });
    }
    res.status(200).json({rows});
  } catch (err) {
    console.error('Error fetching users:', err.stack);
    res.status(500).json({err});
  } finally {
    if (connection) {
      connection.release();
    }
  }

});

app.post('/api/customers', async (req, res) => {
  const { userId } = req.body;

  let connection;

  const query = `
  INSERT INTO customers (
    user_id
  )
  VALUES (?)`;

  try {
    connection = await getPool().getConnection();
    
    const [result] = await connection.execute(query, [userId]);
    console.log('Data inserted:', result);
    
    res.status(200).json({ message: 'customer added!' });
  } catch (err) {
    console.error('Error inserting new customer:', err.stack);
    res.status(500).json({ message: 'Failed to add new customer!' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
  
});

app.get('/api/orders', async (req, res) => {
  const q = `SELECT * FROM orders`;

  let connection;
  
  try {
    connection = await getPool().getConnection();
    const [rows, fields] = await connection.execute(q);
    if (rows.length === 0) {
      return res.status(200).json({ rows: [] });
    }
    res.status(200).json({ rows });
  } catch (err) {
    console.error('Error fetching orders:', err.stack);
    res.status(500).json({ err });
  } finally {
    if (connection) {
      connection.release();
    }
  }

});

app.post('/api/orders', async (req, res) => {
  const {
    customerId,
    confirmation,
  } = req.body;

  let connection;

  const query = `
  INSERT INTO orders (
    customer_id,
    confirmation
  )
  VALUES (?, ?)`;

  const queryValues = [customerId, confirmation ? confirmation : uuidv4()]

  try {
    connection = await getPool().getConnection();
    const [result] = await connection.execute(query, queryValues);
    console.log('Data inserted:', result);
    
    res.status(200).json({ message: 'Order added!' });
  } catch (err) {
    console.error('Error inserting order:', err.stack);
    res.status(500).json({ message: 'Failed to add order!' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
  
});

app.post('/api/order-detail', async (req, res) => {
  const {
    newProduct,
    orderId,
  } = req.body;

  let connection;

  const query = `
  INSERT IGNORE INTO order_detail (
    order_id,
    product_id
  )
  VALUES (?, ?)`;

  const queryValues = [orderId, newProduct.product_id];

  try {
    connection = await getPool().getConnection();
    const [result] = await connection.execute(query, queryValues);
    console.log('Data inserted:', result);
    
    res.status(200).json({ message: 'Order added' });
  } catch (err) {
    console.error('Error inserting order:', err.stack);
    res.status(500).json({ message: 'Failed to order!' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
  
});

app.post('/api/message-to', async (req, res) => {
  const {
    productId,
    customerId
  } = req.body;

  let connection;

  const q = `
  INSERT INTO message_to (
    subject,
    product_id,
    customer_id
  )
  VALUES (?, ?, ?)`;
  const values = [
    `Order Confirmation`,
    productId,
    customerId
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
  const { userId } = req.body;

  console.log('Product ID:', productId);
  console.log('User ID:', userId);

  let connection;

  const q1 = 'DELETE FROM carts WHERE product_id = ? AND user_id = ?';
  const q2 = `
  SELECT users.id as user_id,
    products.id as product_id, products.name, products.description, products.price,
    carts.amount, carts.totalAmount
    FROM carts
    INNER JOIN users ON
    carts.user_id = users.id
    INNER JOIN products ON
    carts.product_id = products.id
    WHERE carts.user_id = ?
  `;

  try {
    connection = await getPool().getConnection();
    const [result] = await connection.execute(q1, [productId, userId]);
    console.log('Delete Result:', result);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const [rows, fields] = await connection.execute(q2, [userId]);
    console.log('Query Result:', rows);
    if (rows.length === 0) {
      return res.status(200).json({ rows: [] });
    }
    res.status(200).json({ rows });
  } catch (err) {
    console.error('Error deleting data:', err.stack);
    res.status(500).json({ message: 'Internal Server Error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

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