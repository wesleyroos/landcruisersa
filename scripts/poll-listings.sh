#!/bin/bash
# Daily AutoTrader availability poll for LandCruiser SA
export PATH="/Users/wesleyroos/.nvm/versions/node/v22.22.0/bin:$PATH"
cd /Users/wesleyroos/Documents/Projects/LandCruiserSA
npx tsx src/scripts/poll-listings.ts
