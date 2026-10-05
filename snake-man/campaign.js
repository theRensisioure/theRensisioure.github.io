// SNAKE-MAN · campaign
// THE 50 MISSIONS. Missions (missions.js) are dealt in order, #1 to #50, and every finished one
// counts toward your player's campaign (kept in the profile, so it carries from run to run).
//   #1-17   warm-up: the usual mix of dots, dodges, kills, stealth, burrows and fruit, harder as you go
//   #18-28  THE SNAKE WAR: enemy snakes pour into the world and hunt you as well as the ghosts
//   #23     cross it and a SNAKE ALLY joins you for good (snakes.js)
//   #28     the SNAKE KING; kill it and the war is won
//   #29-50  the long road: your ally helps, and every 4th mission is about its kills
// After #50 missions go back to random. The war runs while 17 missions are done and fewer than 28.
// Emits: 'warStart', 'allyJoined', 'warEnd', 'campaignDone'.
'use strict';
(() => {
    const { emit } = SM.core;

    const TOTAL = 50, WAR_AFTER = 17, WAR_END = 28, ALLY_AT = 23;
    const ROTATION = ['eat', 'dodge', 'hunt', 'stealth', 'betray', 'burrow', 'fruit', 'clean', 'hunt', 'freeze'];
    // The war missions, by number: [kind, goal] (a null goal uses the kind's own scaling).
    const WAR = {
        18: ['warsurvive', 30], 19: ['snakekill', 1], 20: ['hunt', null], 21: ['snakekill', 2],
        22: ['warsurvive', 60], 23: ['snakekill', 2], 24: ['snakekill', 3], 25: ['dodge', null],
        26: ['warsurvive', 90], 27: ['snakekill', 4], 28: ['king', 1],
    };

    const done = () => SM.profile.camp();
    const war = () => done() >= WAR_AFTER && done() < WAR_END;
    const ally = () => done() >= ALLY_AT;

    // What mission #no is: { kind, goal }.
    function plan(no) {
        const K = SM.missions.KINDS, t = Math.floor((no - 1) / 3);
        let kind = ROTATION[(no - 1) % ROTATION.length], goal = null;
        if (WAR[no]) [kind, goal] = WAR[no];
        else if (no > ALLY_AT && no % 4 === 0) kind = 'allykill';
        else if (no === TOTAL) { kind = 'hunt'; goal = 30; }
        if (kind === 'freeze' && !SM.profile.charges('freeze')) kind = 'hunt';   // freezing needs a charge
        return { kind, goal: goal || K[kind].make(t).goal };
    }

    // A mission was finished: count it, and fire whatever that number opens.
    function finished() {
        const n = SM.profile.camp() + 1;
        SM.profile.setCamp(n);
        if (n === WAR_AFTER) emit('warStart');
        if (n === ALLY_AT) emit('allyJoined');
        if (n === WAR_END) emit('warEnd');
        if (n === TOTAL) emit('campaignDone');
        return n;
    }

    SM.campaign = { TOTAL, WAR_AFTER, WAR_END, ALLY_AT, done, war, ally, plan, finished };
})();
