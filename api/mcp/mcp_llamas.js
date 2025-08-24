const { Errors } = require('../../src/errors/errors');
const LoggerService = require('../../src/utils/logger');
const Functions = require('../../src/utils/functions');

// Ouvrir un llama STW
async function handleOpenCardPack(req, profile) {
    const changes = [];
    const notifications = [];
    
    if (!req.body.cardPackItemId) {
        throw Errors.MCP.invalidPayload();
    }

    if (!profile.items[req.body.cardPackItemId]) {
        throw Errors.MCP.itemNotFound();
    }

    const cardPack = profile.items[req.body.cardPackItemId];
    
    // Charger les données de cartes
    let cardPackData = {};
    try {
        cardPackData = require('../../static-content/campaign/cardPackData.json');
    } catch (error) {
        LoggerService.log('warn', 'Could not load card pack data');
        return { changes, notifications };
    }

    const notification = {
        type: "cardPackResult",
        primary: true,
        lootGranted: {
            tierGroupName: cardPack.templateId.split(":")[1] || "",
            items: []
        },
        displayLevel: 0
    };

    // Vérifier si c'est un pack de choix
    const isChoicePack = cardPackData.choiceCardPacks && 
                         cardPackData.choiceCardPacks.includes(cardPack.templateId);

    if (isChoicePack && req.body.selectionIdx !== undefined) {
        // Pack de choix - utiliser l'item sélectionné
        if (cardPack.attributes.options && cardPack.attributes.options[req.body.selectionIdx]) {
            const chosenItem = cardPack.attributes.options[req.body.selectionIdx];
            const newItemId = Functions.MakeID();
            
            const item = {
                templateId: chosenItem.itemType,
                attributes: chosenItem.attributes || {},
                quantity: chosenItem.quantity || 1
            };

            profile.items[newItemId] = item;

            changes.push({
                changeType: "itemAdded",
                itemId: newItemId,
                item: item
            });

            notification.lootGranted.items.push({
                itemType: item.templateId,
                itemGuid: newItemId,
                itemProfile: req.query?.profileId || "campaign",
                attributes: item.attributes,
                quantity: item.quantity
            });
        }
    } else {
        // Pack standard - générer 10 items aléatoires
        const itemPool = cardPackData.default || [];
        
        for (let i = 0; i < 10; i++) {
            const newItemId = Functions.MakeID();
            const randomIndex = Math.floor(Math.random() * itemPool.length);
            const templateId = itemPool[randomIndex];
            
            const item = {
                templateId: templateId,
                attributes: {
                    legacy_alterations: [],
                    max_level_bonus: 0,
                    level: 1,
                    refund_legacy_item: false,
                    item_seen: false,
                    alterations: ["", "", "", "", "", ""],
                    xp: 0,
                    refundable: false,
                    alteration_base_rarities: [],
                    favorite: false
                },
                quantity: 1
            };

            // Attributs spéciaux pour les workers
            if (templateId.toLowerCase().startsWith("worker:")) {
                item.attributes = Functions.MakeSurvivorAttributes(templateId);
            }

            // 10% de chance d'obtenir un choice pack
            if (Math.random() < 0.1 && cardPackData.choiceCardPacks && cardPackData.choiceCardPacks.length > 0) {
                const choicePackTemplate = cardPackData.choiceCardPacks[
                    Math.floor(Math.random() * cardPackData.choiceCardPacks.length)
                ];
                
                const choicePack = {
                    templateId: choicePackTemplate,
                    attributes: {
                        level: 1,
                        pack_source: "Store",
                        options: []
                    },
                    quantity: 1
                };

                // Générer 2 options pour le choice pack
                const choiceOptions = cardPackData[choicePackTemplate.toLowerCase()] || cardPackData.default;
                const usedOptions = [];
                
                for (let j = 0; j < 2; j++) {
                    let randomOptionIndex;
                    do {
                        randomOptionIndex = Math.floor(Math.random() * choiceOptions.length);
                    } while (usedOptions.includes(randomOptionIndex) && usedOptions.length < choiceOptions.length);
                    
                    usedOptions.push(randomOptionIndex);
                    const optionTemplate = choiceOptions[randomOptionIndex];
                    
                    const option = {
                        itemType: optionTemplate,
                        attributes: {
                            legacy_alterations: [],
                            max_level_bonus: 0,
                            level: 1,
                            refund_legacy_item: false,
                            item_seen: false,
                            alterations: ["", "", "", "", "", ""],
                            xp: 0,
                            refundable: false,
                            alteration_base_rarities: [],
                            favorite: false
                        },
                        quantity: 1
                    };

                    if (optionTemplate.toLowerCase().startsWith("worker:")) {
                        option.attributes = Functions.MakeSurvivorAttributes(optionTemplate);
                    }

                    choicePack.attributes.options.push(option);
                }

                profile.items[newItemId] = choicePack;
                item.templateId = choicePackTemplate;
                item.attributes = choicePack.attributes;
            }

            profile.items[newItemId] = item;

            changes.push({
                changeType: "itemAdded",
                itemId: newItemId,
                item: item
            });

            notification.lootGranted.items.push({
                itemType: templateId,
                itemGuid: newItemId,
                itemProfile: req.query?.profileId || "campaign",
                attributes: item.attributes,
                quantity: 1
            });
        }
    }

    notifications.push(notification);

    // Consommer le card pack
    if (cardPack.quantity <= 1) {
        delete profile.items[req.body.cardPackItemId];
        changes.push({
            changeType: "itemRemoved",
            itemId: req.body.cardPackItemId
        });
    } else {
        cardPack.quantity -= 1;
        changes.push({
            changeType: "itemQuantityChanged",
            itemId: req.body.cardPackItemId,
            quantity: cardPack.quantity
        });
    }

    return { changes, notifications };
}

// Peupler les offres pré-roll pour les X-Ray llamas STW
async function handlePopulatePrerolledOffers(req, profile) {
    const changes = [];
    
    // Charger les données de cartes
    let cardPackData = {};
    try {
        cardPackData = require('../../static-content/campaign/cardPackData.json');
    } catch (error) {
        LoggerService.log('warn', 'Could not load card pack data');
        return { changes };
    }

    const today = new Date().toISOString().split("T")[0] + "T23:59:59.999Z";

    for (const [itemId, item] of Object.entries(profile.items)) {
        if (item.templateId.toLowerCase() === "prerolldata:preroll_basic") {
            const currentTime = new Date().toISOString();
            
            if (currentTime > item.attributes.expiration) {
                // Régénérer les items du llama
                item.attributes.items = [];

                for (let i = 0; i < 10; i++) {
                    const itemPool = cardPackData.default || [];
                    const randomIndex = Math.floor(Math.random() * itemPool.length);
                    const templateId = itemPool[randomIndex];
                    
                    const prerollItem = {
                        itemType: templateId,
                        attributes: {
                            legacy_alterations: [],
                            max_level_bonus: 0,
                            level: 1,
                            refund_legacy_item: false,
                            item_seen: false,
                            alterations: ["", "", "", "", "", ""],
                            xp: 0,
                            refundable: false,
                            alteration_base_rarities: [],
                            favorite: false
                        },
                        quantity: 1
                    };

                    if (templateId.toLowerCase().startsWith("worker:")) {
                        prerollItem.attributes = Functions.MakeSurvivorAttributes(templateId);
                    }

                    // 10% de chance d'avoir un choice pack
                    if (Math.random() < 0.1 && cardPackData.choiceCardPacks && cardPackData.choiceCardPacks.length > 0) {
                        const choicePackTemplate = cardPackData.choiceCardPacks[
                            Math.floor(Math.random() * cardPackData.choiceCardPacks.length)
                        ];
                        
                        const choicePack = {
                            itemType: choicePackTemplate,
                            attributes: {
                                level: 1,
                                pack_source: "Store",
                                options: []
                            },
                            quantity: 1
                        };

                        const choiceOptions = cardPackData[choicePackTemplate.toLowerCase()] || cardPackData.default;
                        const usedOptions = [];
                        
                        for (let j = 0; j < 2; j++) {
                            let randomOptionIndex;
                            do {
                                randomOptionIndex = Math.floor(Math.random() * choiceOptions.length);
                            } while (usedOptions.includes(randomOptionIndex) && usedOptions.length < choiceOptions.length);
                            
                            usedOptions.push(randomOptionIndex);
                            const optionTemplate = choiceOptions[randomOptionIndex];
                            
                            const option = {
                                itemType: optionTemplate,
                                attributes: {
                                    legacy_alterations: [],
                                    max_level_bonus: 0,
                                    level: 1,
                                    refund_legacy_item: false,
                                    item_seen: false,
                                    alterations: ["", "", "", "", "", ""],
                                    xp: 0,
                                    refundable: false,
                                    alteration_base_rarities: [],
                                    favorite: false
                                },
                                quantity: 1
                            };

                            if (optionTemplate.toLowerCase().startsWith("worker:")) {
                                option.attributes = Functions.MakeSurvivorAttributes(optionTemplate);
                            }

                            choicePack.attributes.options.push(option);
                        }

                        item.attributes.items.push(choicePack);
                    } else {
                        item.attributes.items.push(prerollItem);
                    }
                }

                item.attributes.expiration = today;

                changes.push({
                    changeType: "itemAttrChanged",
                    itemId: itemId,
                    attributeName: "items",
                    attributeValue: item.attributes.items
                });

                changes.push({
                    changeType: "itemAttrChanged",
                    itemId: itemId,
                    attributeName: "expiration",
                    attributeValue: item.attributes.expiration
                });
            }
        }
    }

    return { changes };
}

module.exports = {
    handleOpenCardPack,
    handlePopulatePrerolledOffers
};