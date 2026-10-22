#!/usr/bin/env node
/**
 * Initialize the database from schema.sql
 * Run with: npm run setup-db
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, '../../database/schema.sql');

(async () => {
    console.log('🔧 Initializing BlockBioVote database...\n');
    
    try {
        if (!fs.existsSync(schemaPath)) {
            console.error('❌ schema.sql not found at:', schemaPath);
            process.exitCode = 1;
            return;
        }

        // First, connect WITHOUT selecting a database to create the database
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            multipleStatements: true
        });

        console.log(`✅ Connected to MySQL at ${process.env.DB_HOST || 'localhost'}`);

        const schema = fs.readFileSync(schemaPath, 'utf8');
        
        console.log('📝 Executing schema.sql...');
        await connection.query(schema);
        
        await connection.end();
        
        console.log('\n✅ Database initialized successfully!');
        console.log('✅ Tables created: voters, candidates, audit_log');
        console.log('✅ Sample candidates inserted');
        console.log('\n✨ BlockBioVote database is ready to use!');
        
    } catch (e) {
        console.error('\n❌ Database initialization failed:');
        console.error('Error:', e.message);
        
        if (e.code === 'ER_ACCESS_DENIED_ERROR') {
            console.error('\n💡 Fix: Check your database credentials in server/.env');
            console.error('   - DB_HOST:', process.env.DB_HOST || 'localhost');
            console.error('   - DB_USER:', process.env.DB_USER || 'root');
            console.error('   - DB_PASSWORD: (check in server/.env)');
        } else if (e.code === 'PROTOCOL_CONNECTION_LOST' || 
                   e.code === 'ECONNREFUSED' || 
                   e.message?.includes('connect')) {
            console.error('\n💡 Fix: Ensure MySQL is running');
            console.error('   Windows: Start MySQL service');
            console.error('   Mac/Linux: brew services start mysql (or similar)');
        }
        
        process.exitCode = 1;
    }
})();
