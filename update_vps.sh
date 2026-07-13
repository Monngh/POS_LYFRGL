#!/bin/bash
cd ~/POS_LYFRGL/backend
sed -i 's/FACTURAPI_API_KEY=.*/FACTURAPI_API_KEY="sk_test_EYk5kZ5akgQHC7WtM91XfmWikVbJVszPWcyMQmtF4J"/g' .env
npx pm2 reload ecosystem.config.js --env production
