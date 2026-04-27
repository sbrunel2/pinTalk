/**
 * reset-db.js — Remet la base de données Pintalk à zéro
 * Usage : node reset-db.js
 * ⚠️  IRRÉVERSIBLE — efface toutes les collections
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI non défini dans .env');
    process.exit(1);
}

async function resetDB() {
    console.log('🔄 Connexion à MongoDB Atlas...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connecté.');

    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();

    if (collections.length === 0) {
        console.log('ℹ️  Base déjà vide.');
    } else {
        console.log(`\n📦 Collections trouvées : ${collections.map(c => c.name).join(', ')}`);
        console.log('\n🗑️  Suppression en cours...');

        for (const col of collections) {
            await db.collection(col.name).drop();
            console.log(`   ✅ ${col.name} supprimée`);
        }
    }

    console.log('\n✅ Base de données réinitialisée avec succès.');
    console.log('   La base est prête à accueillir un premier utilisateur.');
    console.log('   Les index seront recréés automatiquement au démarrage du serveur.\n');

    await mongoose.disconnect();
    process.exit(0);
}

resetDB().catch(err => {
    console.error('❌ Erreur :', err.message);
    process.exit(1);
});
