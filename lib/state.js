class State {
  /**
   * Create a new state object
   *
   * @description
   * Fungsi dalam action callback harus berbeda. Untuk mengantisipasi "call twice"
   * id parameter dalam subscribe juga untuk mengantisipasi "call twice"
   *
   * @constructor
   * @this {State}
   *
   * @property {array} subscriptions - List of all subscribed elements to the state
   * @property {array} history - List of all actions that have been called on the state
   */
  constructor() {
    this.subscriptions = [];
    this.history = [];
  }

  subscribe(action, callback, id = "") {
    this.subscriptions[action] = this.subscriptions[action] || [];

    // find duplicate callback before adding
    const isDuplicate = this.subscriptions[action].find(
      (subscription) =>
        subscription.callback.toString() === callback.toString() &&
        subscription?.id === id
    );

    // if not duplicate
    if (!isDuplicate)
      this.subscriptions[action].push({
        callback: callback,
        id,
        action: function (data) {
          callback.apply(data);
        },
      });
  }

  dispatch(action, data) {
    data = data || [];

    // Store history of actions (not strictly neccessary)
    this.history.push([action, data]);

    // Call action reducers
    if ("function" === typeof this[action]) {
      this[action].apply(this, data);
    }

    // Add the action and state as final arguments
    data.push(action);
    data.push(this);

    // Call subscribers
    this.subscriptions[action] = this.subscriptions[action] || [];
    this.subscriptions[action].forEach(function (subscription) {
      // execution of callback action
      subscription.action(data);
    });
  }
}

const state = new State();

module.exports = { state };
