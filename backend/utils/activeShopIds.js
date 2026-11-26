const Shop = require("../models/Shop");

function createActiveShopIdsLoader(load) {
  let pending;
  return function getActiveShopIds() {
    if (!pending) {
      pending = Promise.resolve()
        .then(load)
        .finally(() => {
          pending = null;
        });
    }
    return pending;
  };
}

const getActiveShopIds = createActiveShopIdsLoader(() =>
  Shop.find({ isActive: true }).distinct("_id")
);

module.exports = { createActiveShopIdsLoader, getActiveShopIds };
