const express = require('express');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

mongoose.connect('mongodb+srv://techisetz08:8gbDVT6ogkrLin6r@cluster0.pkx0lax.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});


const TeamSchema = new mongoose.Schema({
    teamName: { type: String, required: true },
    players: [{ type: String, required: true }],
    captain: { type: String, required: true },
    viceCaptain: { type: String, required: true },
    totalPoints: { type: Number, default: 0 },
});

const Team = mongoose.model('Team', TeamSchema);

//player data
const playerData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'players.json'), 'utf-8'));

//Load match data from JSON file
const matchData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'match.json'), 'utf-8'));

const app = express();
app.use(express.json());

//Add team API
app.post('/add-team', async (req, res) => {
    const { teamName, players, captain, viceCaptain } = req.body;
    //console.log(players);
    //Validate player selection rules
    const selectedPlayers = new Set(players);
    const teamPlayers = playerData.filter((player) => selectedPlayers.has(player.Player));

    //const playerTypes = {
    //    WK: 0,
    //    BAT: 0,
    //    AR: 0,
    //    BWL: 0,
    //};
    const playerTypes = {
        WICKETKEEPER: 0,
        BATTER: 0,
        "ALL-ROUNDER": 0,
        BOWLER: 0,
    };

    for (const player of teamPlayers) {
        playerTypes[player.Role]++;
    }
    //console.log(playerTypes);
    if (
        playerTypes.WK < 1 ||
        playerTypes.WK > 8 ||
        playerTypes.BAT < 1 ||
        playerTypes.BAT > 8 ||
        playerTypes.AR < 1 ||
        playerTypes.AR > 8 ||
        playerTypes.BWL < 1 ||
        playerTypes.BWL > 8
    ) {
        return res.status(400).json({ error: 'Invalid player selection' });
    }

    if (selectedPlayers.size !== 11) {
        return res.status(400).json({ error: 'Team must have 11 players' });
    }

    if (
        !playerData.some((player) => player.Player === captain) ||
        !playerData.some((player) => player.Player === viceCaptain)
    ) {
        return res.status(400).json({ error: 'Invalid captain or vice-captain' });
    }

    //Create a new team entry
    const team = new Team({
        teamName,
        players,
        captain,
        viceCaptain,
    });

    await team.save();
    res.status(201).json(team);
});

//Process match API
app.get('/process-result', async (req, res) => {
    for (const ball of matchData) {
        const { batter, bowler, player_out, kind } = ball;

        if (ball.batsman_run > 0) {
            await Team.updateOne(
                { players: batter },
                { $inc: { totalPoints: ball.batsman_run + (ball.non_boundary ? 0 : 1) + (ball.batsman_run === 6 ? 2 : 0) } }
            );
        }

        if (kind === 'bowled' || kind === 'lbw') {
            await Team.updateOne({ players: batter }, { $inc: { totalPoints: -2 } });
        }

        if (player_out !== 'NA') {
            await Team.updateOne({ players: bowler }, { $inc: { totalPoints: 25 + (kind === 'lbw' || kind === 'bowled' ? 8 : 0) } });
        }

        if (kind === 'caught') {
            await Team.updateOne({ players: ball.fielders_involved }, { $inc: { totalPoints: 8 } });
        } else if (kind === 'stumped') {
            await Team.updateOne({ players: ball.fielders_involved }, { $inc: { totalPoints: 12 } });
        } else if (kind === 'run out') {
            await Team.updateOne({ players: ball.fielders_involved }, { $inc: { totalPoints: 6 } });
        }
    }

    const teams = await Team.find();
    for (const team of teams) {
        const captainPoints = await Team.findOne({ players: team.captain }).select('totalPoints');
        const viceCaptainPoints = await Team.findOne({ players: team.viceCaptain }).select('totalPoints');

        await Team.updateOne(
            { _id: team._id },
            { $inc: { totalPoints: captainPoints.totalPoints * 1 + viceCaptainPoints.totalPoints * 0.5 } }
        );
    }

    res.json({ message: 'Match result processed' });
});


app.get('/team-result', async (req, res) => {
    const teams = await Team.find().sort({ totalPoints: -1 });
    const winningTeams = teams.filter((team, index) => teams[0].totalPoints === team.totalPoints);

    res.json({
        winningTeams: winningTeams.map((team) => ({
            teamName: team.teamName,
            totalPoints: team.totalPoints,
        })),
    });
});

app.listen(3000, () => {
    console.log('Server is running on port 3000');
}); 