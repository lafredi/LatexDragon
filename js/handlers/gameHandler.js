/**
 * module containing all the function for handling the elements/event of the game tab
 * @module gameHandler
 */
var self = module.exports = {
	/**
	 * Initialize everything the tab need in order to run properly.
	 */
	init: () => {
		const instance = require('../Application')

		if (!instance.serverStatus) {
			$('#game-ui').hide()
			$('#game-something-went-wrong').append('<h1 class="display-1">Serveur hors ligne <i class="fa fa-exclamation-triangle" aria-hidden="true"></i></h1>').show()
		}
		else if (instance.gameState == null) {
			$('#game-ui').hide()
			$('#game-something-went-wrong').append('<h1 class="display-1">Synchronization en cours <i class="fa fa-refresh fa-spin"></i></h1>').show()
		}
		else if (instance.gameState.currentGame == -1) {
			$('.can-be-disabled').prop('disabled', true)

			$('#main-formule').append('<h1 class="display-1">Aucune partie en cours <i class="fa fa-exclamation-triangle"></i></h1>')

			self.setAnimations()
		}
		else {
			self.onStart()

			self.setAnimations()
		}
	},

	unload: () => {
		const instance = require('../Application')
		if (instance.gameState != null)
			instance.gameState.stopCountdown()
	},

  /**
   * Set the events for the game tab.
	 * Only the mouse clicks events are working right now.
   */
  setEvents: () => {
		const mouseEventHandler = require('./mouseEventHandler')

    mouseEventHandler.setEvents()
    //DragNDropHandler.setEvents(obj)
  },

	setAnimations: (callback) => {
		$('.toolbar').show().animateCss('slideInLeft', 0.3, 0, () => {
			$('#main-content').show().animateCss('slideInLeft', 0.3)
			$('#timeline').show().animateCss('slideInUp', 0.3)
		})
	},

	onStart: () => {
		const instance = require('../Application')
		const Request = require('../Request')
		const utils = require('../utils')

		if (instance.gameState.getCurrent().gameId == undefined)
			self.startNewGame()
		else
			Request.buildRequest('RESUME', self.canResume).send('/' + instance.gameState.getCurrent().gameId)
	},

	canResume: (response, status) => {
		const instance = require('../Application')
		const Request = require('../Request')

		if (Request.checkError(response, status, '#gameNotification') === false)
			throw '[ERROR]: request response invalid, request might have failed.'

		Request.buildRequest('GAMESTATE', self.gameStartResponse).send('/' + instance.gameState.getCurrent().gameId)
	},

  /**
   * Request used to start a new game, will ask the server to start a new game
	 * using the parameters contained in gameState to define the configuration of the
	 * game.
   */
  startNewGame: () => {
		const instance = require('../Application')
		const Request = require('../Request')

    var request = Request.buildRequest('START', self.startNewGameResponse)

    request.send('/' + instance.gameState.getCurrent().mode + '/' + instance.gameState.getCurrent().ruleSet + '/' + instance.gameState.getCurrent().formulaId + '/' + instance.gameState.getCurrent().useTheorem)
  },

  /**
   * Response of the startNewGame request.
   * Will display an error message if the server can't create a new game.
   * If it's a success it will register the game ID and send a request to get the
   * game state.
   * @param {Object} response response from the request (jQuery ajax response)
   * @param {String} status response status from the request
   */
  startNewGameResponse: (response, status) => {
		const instance = require('../Application')
		const Request = require('../Request')

		var o = Request.checkError(response, status, '#gameNotification')

		if (o === false)
			throw '[ERROR]: request response invalid, request might have failed.'

    instance.gameState.getCurrent().gameId = o.id

    var request = Request.buildRequest('GAMESTATE', self.gameStartResponse).send("/" + o.id)
  },

  /**
   * Response of the request to get the game state after a new game is created.
   * Will start a timer if it's enabled and delegate the processing of the response
   * to gameUpdateMathResponse.
   * @param {Object} response response from the request (jQuery ajax response)
   * @param {String} status response status from the request
	 * @throws Will throw an error if the countdown is already over
   */
  gameStartResponse: (response, status) => {
		const instance = require('../Application')

    self.gameUpdateMathResponse(response, status)

    //Stop any timer currently running
    instance.gameState.stopCountdown()
		$('#game-timer').hide()
		$('#game-timer').tooltip('hide')

    //Start timer
		self.startTimer()
  },

  /**
   * Send a request to get the game state.
	 * @throws Will throw an error if the countdown is already over
   */
	gameStateRequest: () => {
		const instance = require('../Application')
		const Request = require('../Request')

		var request = Request.buildRequest('GAMESTATE', self.gameUpdateMathResponse)

		request.send('/' + instance.gameState.getCurrent().gameId)

		//Stop any timer currently running
    instance.gameState.stopCountdown()
		$('#game-timer').hide()
		$('#game-timer').tooltip('hide')

    //Start timer
		self.startTimer()
  },

  /**
   * Function that process the response from the server containing the formula state.
   * Will throw an error if the request failed.
   * @param {Object} response response from the request (jQuery ajax response)
   * @param {String} status response status from the request
   * @throws if the request fail and the function receive a status diffrent than success.
   */
  gameUpdateMathResponse: (response, status) => {
		const instance = require('../Application')
		const utils = require('../utils')
		const Request = require('../Request')

		var o = Request.checkError(response, status, '#gameNotification')

		if (o === false)
			throw '[ERROR]: request response invalid, request might have failed.'

		instance.gameState.getCurrent().currentState = o

    //Set new math
    $('#main-formule').hide('fast')
		$('#main-formule').html('')
		$('#main-formule').text(instance.gameState.getCurrent().currentState.math)

		//Update Timeline
		self.updateTimeline(instance.gameState.getCurrent().currentState.timeline)

    //Call mathJax typeset and show the formule once it's done
    utils.typesetMath(() => {
			$('#main-formule').show('fast')

			//Set events
			self.setEvents()

			instance.settings.applySettings()
    })

		//Check for VICTORY
		if ((o.gameStatus == 'VICTORY') && (instance.gameState.getCurrent().mode == 'NORMAL')) {
			$('#game-timer').hide()
			$('#game-timer').tooltip('hide')
			instance.gameState.getCurrent().countdown.stopCountdown()
			var elapsedTime = instance.gameState.getCurrent().countdown.timeElapsed()
			instance.displayPopup('Victoire', 'Bravo, vous avez résolu la formule en ' + elapsedTime + ' minutes', 'Accueil', 'Recommencer',
			() => {
				instance.gameState.delete(instance.gameState.getCurrent().gameId)
				instance.requestHtml('HOME')
				$('#popup').modal('hide')
			}, () => {
				self.restartGame()
				$('#popup').modal('hide')
			}, () => {
				instance.gameState.delete(instance.gameState.getCurrent().gameId)
				instance.requestHtml('GAME')
			})
			Request.buildRequest('OVER').send('/' + instance.gameState.getCurrent().gameId)
		}
  },

  /**
   * Send a request to the server to apply a rule to the formula.
   * Call gameUpdateMathResponse to process the response.
   * @param {Event} event jQuery Event object
   */
  gameRuleRequest: (event) => {
		const instance = require('../Application')
		const Request = require('../Request')

    event.stopPropagation()

    var request = Request.buildRequest("APPLYRULE", self.gameUpdateMathResponse)
    request.send("/" + instance.gameState.getCurrent().gameId + "/" + event.data.value.expId + "/" + event.data.value.ruleId + "/" + event.data.value.context)

    if ($("#tooltip").is(":visible"))
      $("#tooltip").hide(100)
  },

  /**
   * Function handling the end of the countdown.
   * When the countdown is over an OVER request is send to the server
   * to signal the game is over.
   * When the request is over call gameOverResponse to handle the end of the game
   * clientside.
   */
  timerOnOver: () => {
		const instance = require('../Application')
		const Request = require('../Request')

		//Clear timer text
		$('#game-timer').hide()
		$('#game-timer').tooltip('hide')

    instance.displaySuccessNotification('#gameNotification', 'Temps écouler, partie finie.')

    Request.buildRequest('OVER', self.gameOverResponse).send('/' + instance.gameState.getCurrent().gameId)
  },

  /**
   * Function handling the end of the game clientside, restart the window by hiding
   * the formula and the tools and then show the start button.
   * @param {Object} response response from the request (jQuery ajax response)
   * @param {String} status response status from the request
   */
  gameOverResponse: (response, status) => {
		const instance = require('../Application')
		const Request = require('../Request')

		if (Request.checkError(response, status, '#gameNotification') === false)
			throw '[ERROR]: request response invalid, request might have failed.'

		instance.displayPopup('Défaite', 'Temps écouler, vous avez perdu !', 'Accueil', 'Recommencer',
		() => {
			instance.gameState.delete(instance.gameState.getCurrent().gameId)
			instance.requestHtml('HOME')
			$('#popup').modal('hide')
		}, () => {
			self.restartGame()
			$('#popup').modal('hide')
		}, () => {
			instance.gameState.delete(instance.gameState.getCurrent().gameId)
			instance.requestHtml('GAME')
		})
  },

  /**
   * Function handling the update of the countdown.
   * Each time the countdown is updated the timer text element in the window is updated too.
   * @param {Countdown} countdown countdown object
   */
  timerOnUpdate: (countdown) => {
		$('#game-timer').tooltip('show')
    $("#game-timer").attr('data-original-title', 'Temps restant : ' + countdown.toString())
  },

  /**
   * Function handling the restart button.
   * Send an OVER request then send a START request using the default handler for
   * those request.
   */
  restartGame: () => {
		const instance = require('../Application')
		const Request = require('../Request')

		instance.gameState.stopCountdown()
		instance.gameState.getCurrent().countdown = null

    Request.buildRequest("OVER", self.startNewGame).send("/" + instance.gameState.getCurrent().gameId)
  },

	/**
	 * Request the previous state of the game.
	 */
	previousState: () => {
		const instance = require('../Application')
		const Request = require('../Request')

		Request.buildRequest('PREVIOUS', self.gameUpdateMathResponse).send('/' + instance.gameState.getCurrent().gameId)
	},

	/**
	 * Request the next state of the game.
	 */
	nextState: () => {
		const instance = require('../Application')
		const Request = require('../Request')

		Request.buildRequest('NEXT', self.gameUpdateMathResponse).send('/' + instance.gameState.getCurrent().gameId)
	},

	/**
	 * Toggle the display of the timeline.
	 */
	toggleTimeline: () => {
		if ($('#hideTimeline').is(':visible')) {
			$('#hideTimeline').hide()
			$('#showTimeline').show().css('display', 'flex')

			$('#timeline').animateCss('slideOutDown', 0.2, 0, () => {
				$('#timeline-elements').hide()
			})
		}
		else {
			$('#hideTimeline').show().css('display', 'flex')
			$('#showTimeline').hide()

			$('#timeline-elements').show()
			$('#timeline').animateCss('slideInUp', 0.2, 0)
		}
	},

	/**
	 * Update the content of the timeline.
	 * Called each time the current game update.
	 * @param {Object} timeline timeline object from the gameState object
	 */
	updateTimeline: (timeline) => {
		$('#timeline-elements').html('')

		for (var i = timeline.elements.length-1 ; i >= 0 ; i--) {
			var elem
			if (i == timeline.current)
				elem = $('<div></div>').addClass('timeline-element current-element btn btn-danger').text(timeline.elements[i].text)
			else
				elem = $('<div></div>').addClass('timeline-element btn btn-info').text(timeline.elements[i].text)

			elem.click({ param: i }, self.timelineOnClickHandler)

			$('#timeline-elements').append(elem)
		}
	},

	/**
	 * Depending on if the game is in theorem mode or not the handler for the
	 * onclick event differ.
	 * @param {Event} event Jquery event object
	 */
	timelineOnClickHandler: (event) => {
		if ($('#addTheorem').is(':visible'))
			self.requestStateFromTimeline(event.data.param)
		else
			self.selectForTheorem(event.data.param, event.currentTarget)
	},

	/**
	 * Reqest the gameState of the index state.
	 * @param {int} index Number of the state requested.
	 */
	requestStateFromTimeline: (index) => {
		const instance = require('../Application')
		const Request = require('../Request')

		Request.buildRequest('TIMELINE', self.gameUpdateMathResponse).send('/' + instance.gameState.getCurrent().gameId + '/' + index)
	},

	/**
	 * Object containing the index for the theorem creation.
	 * Is always null expect if timeline elements are selectionned for theorem
	 * creation.
	 */
	theoremSelection: { start: null, end: null},

	/**
	 * Toggle the timeline between the theorem mode and "history" mode.
	 * When in theorem mode you can't hide the timeline and if the timeline was
	 * hiddden it will be showed automatically.
	 * Will also clear theoremSelection each time this function is called.
	 */
	toggleCreateTheorem: () => {
		const instance = require('../Application')

		if ($('#addTheorem').is(':visible')) {
			$('#addTheorem').hide()

			if ($('#timeline-elements').is(':hidden'))
				self.toggleTimeline()

			$('#hideTimeline').hide()

			$('#validTheorem').show().css('display', 'flex')
			$('#cancelTheorem').show().css('display', 'flex')
		}
		else {
			$('#addTheorem').show().css('display', 'flex')

			$('#hideTimeline').show().css('display', 'flex')

			$('#validTheorem').hide()
			$('#cancelTheorem').hide()

			$('.timeline-element').each(function () {
				$(this).removeClass('btn-warning')
				if ($(this).hasClass('current-element'))
					$(this).addClass('btn-danger')
				else
					$(this).addClass('btn-info')
			})
		}

		self.theoremSelection.start = null
		self.theoremSelection.end = null
	},

	/**
	 * Will select for the theorem creation the target element.
	 * If the target is already selected will unselect it.
	 * If not the target is added in the theoremSelection object.
	 * @param {int} index Number of the state clicked.
	 * @param {Object} target DOM element of the event target.
	 */
	selectForTheorem: (index, target) => {
		const instance = require('../Application')

		//If we click on an already selectionned item we unselect it
		if (self.theoremSelection.start == index) {
			self.theoremSelection.start = null
			$(target).removeClass('btn-warning')
			if ($(target).hasClass('current-element'))
				$(target).addClass('btn-danger')
			else
				$(target).addClass('btn-info')
		}
		else if (self.theoremSelection.end == index) {
			self.theoremSelection.end = null
			$(target).removeClass('btn-warning')
			if ($(target).hasClass('current-element'))
				$(target).addClass('btn-danger')
			else
				$(target).addClass('btn-info')
		}
		//Else we first select the starting point then the end one
		else if (self.theoremSelection.start == null) {
			self.theoremSelection.start = index
			$(target).addClass('btn-warning')
			if ($(target).hasClass('current-element'))
				$(target).removeClass('btn-danger')
			else
				$(target).removeClass('btn-info')
		}
		else if (self.theoremSelection.end == null) {
			self.theoremSelection.end = index
			$(target).addClass('btn-warning')
			if ($(target).hasClass('current-element'))
				$(target).removeClass('btn-danger')
			else
				$(target).removeClass('btn-info')
		}
	},

	/**
	 * Check for the creation of the theorem. Will display a popup with either a
	 * Error message or a success message and ask the user if he want to process
	 * with the theorem creation.
	 */
	validTheorem: () => {
		const instance = require('../Application')

		if (self.theoremSelection.start > self.theoremSelection.end) {
			var tmp = self.theoremSelection.start
			self.theoremSelection.start = self.theoremSelection.end
			self.theoremSelection.end = tmp
		}

		if ((self.theoremSelection.start == null) || (self.theoremSelection.end == null))
			instance.displayPopup('Création d\'un théorème', 'L\' une des 2 valeurs n\'est pas selectionné.', 'OK', '', () => { $('#popup').modal('hide') })
		else
			instance.displayPopup('Création d\'un théorème', 'Voulez-vous créer ce théorème ?', 'Oui', 'Annuler', self.sendTheoremCreation, () => { $('#popup').modal('hide') })
	},

	/**
	 * Send a CREATETHEOREM request then toggle off the theorem mode and hide
	 * the popup.
	 */
	sendTheoremCreation: () => {
		const instance = require('../Application')
		const Request = require('../Request')

		Request.buildRequest('CREATETHEOREM').send('/' + instance.gameState.getCurrent().gameId + '/' + self.theoremSelection.start + '/' + self.theoremSelection.end)

		self.toggleCreateTheorem()
		$('#popup').modal('hide')
	},

	/**
	 * Toggle the rules list.
	 * If hidden will send a request RULESLIST and display the list container.
	 * If visible will hide the list container
	 */
	toggleRulesList: () => {
		const instance = require('../Application')
		const Request = require('../Request')

		if ($('#rules-list').is(':hidden')) {
			Request.buildRequest('RULESLIST', self.rulesListReply).send('/' + instance.gameState.getCurrent().gameId)

			$('#rules-list').animateCss('slideInDown', 0.3)
			$('#rules-list').show()
			$('#rules-loader').show()
		}
		else {
			$('#rules-list').animateCss('slideOutUp', 0.3, 0, () => {
				$('#rules-list').hide()
				$('#rules-content').hide()
			})
		}

	},

	/**
   * Response to the RULESLIST request.
	 * Call displayRulesList to display the rules list with the JSON Object
	 * received from the request.
   * @param {Object} response response from the request (jQuery ajax response)
   * @param {String} status response status from the request
   */
	rulesListReply: (response, status) => {
		const instance = require('../Application')
		const Request = require('../Request')

		var o = Request.checkError(response, status, '#gameNotification')

		if (o === false)
			throw '[ERROR]: request response invalid, request might have failed.'

		self.displayRulesList(o.rules)
	},

	/**
	 * Build the rules list and displays it.
	 * @param {Object} rules JSON object containing all the rules.
	 */
	displayRulesList: (rules) => {
		$('#rules-content').html('')

		for (var item in rules) {
			for (var type in rules[item]) {
				var title = $('<h1></h1>').addClass('display-3').text(type)
				$('#rules-content').append(title)
				for (var rule in rules[item][type]) {
					var elem = $('<div></div>').addClass('notif alert alert-info').text(rules[item][type][rule])
					$('#rules-content').append(elem)
				}
			}
		}

		$('#rules-loader').hide()
		utils.typesetMath(() => { $('#rules-content').show('fast') }, 'rules-content')
	},

	synchronize: () => {
		const instance = require('../Application')

		instance.synchronize()
		instance.requestHtml('GAME')
	},

	deleteGame: (index) => {
		const instance = require('../Application')
		const Request = require('../Request')

		var gameId

		if (index && typeof index === 'number')
			gameId = instance.gameState.array[index].gameId
		else
			gameId = instance.gameState.getCurrent().gameId

		//Stop any timer currently running
		instance.gameState.stopCountdown()
		$('#game-timer').hide()
		$('#game-timer').tooltip('hide')

		Request.buildRequest('DELETE').send('/' + gameId)

		instance.gameState.delete(gameId)

		instance.gameState.updateCurrent()

		instance.requestHtml('GAME')
	},

	/**
	 * @throws Will throw an error if the countdown is already over
	 */
	startTimer: () => {
		const instance = require('../Application')
		const Countdown = require('../Countdown')

		var current = instance.gameState.getCurrent()

		if (current.mode == 'NORMAL') {
			if (current.countdown == null)
				current.countdown = new Countdown (Countdown.minutesToMilliseconds(2), self.timerOnOver, self.timerOnUpdate)

			else if (typeof current.countdown === 'number')
				current.countdown = new Countdown (current.countdown, self.timerOnOver, self.timerOnUpdate)

			else if (current.countdown.state == 'OVER') {
				instance.displayErrorNotification('#gameNotification', 'Le timer est fini, la partie est donc fini et devrait être supprimer ou recommencer.')
				throw '[ERROR]: Countdown is over game should be deleted or restarted'
			}

			current.countdown.startCountdown()

			instance.gameState.getCurrent().countdown = current.countdown

			$('#game-timer').show()
			$('#game-timer').tooltip('show')
		}
	},

	toggleGameList: () => {
		if ($('#game-list').is(':hidden')) {
			$('#game-list').animateCss('slideInDown', 0.3)
			$('#game-list').show()
			$('#game-list-content').hide()
			self.buildGameList()
		}
		else {
			$('#game-list').animateCss('slideOutUp', 0.3, 0, () => {
				$('#game-list').hide()
			})
		}
		$('[data-toggle="tooltip"]').tooltip('hide')
	},

	buildGameList: () => {
		const instance = require('../Application')
		const utils = require('../utils')

		$('#game-list-content').html('')

		for (var i in instance.gameState.array) {
			var elem = $('<div></div>')
			if (i == instance.gameState.currentGame) {
				if (instance.gameState.array[i].mode == 'NORMAL')
					elem.append('<div><i class="fa fa-long-arrow-right fa-fw text-info"></i><a onclick="require(\'./js/handlers/gameHandler\').deleteGame(' + i + ')" class="text-danger"><i class="fa fa-trash fa-fw" aria-hidden="true"></i></a>' + instance.gameState.array[i].mode + ' -> Temps restant : ' + instance.gameState.array[i].countdown + ' </div>')
				else
					elem.append('<div><i class="fa fa-long-arrow-right fa-fw text-info"></i><a onclick="require(\'./js/handlers/gameHandler\').deleteGame(' + i + ')" class="text-danger"><i class="fa fa-trash fa-fw" aria-hidden="true"></i></a>' + instance.gameState.array[i].mode + '</div>')
			}
			else {
				if (instance.gameState.array[i].mode == 'NORMAL')
					elem.append('<div><a onclick="require(\'./js/handlers/gameHandler\').deleteGame(' + i + ')" class="text-danger"><i class="fa fa-trash fa-fw" aria-hidden="true"></i></a>' + instance.gameState.array[i].mode + ' -> Temps restant : ' + instance.gameState.array[i].countdown + ' </div>')
				else
					elem.append('<div><a onclick="require(\'./js/handlers/gameHandler\').deleteGame(' + i + ')" class="text-danger"><i class="fa fa-trash fa-fw" aria-hidden="true"></i></a>' + instance.gameState.array[i].mode + '</div>')
			}

			if (instance.gameState.array[i].currentState != null)
				elem.append('<div>' + instance.gameState.array[i].currentState.timeline.elements[instance.gameState.array[i].currentState.timeline.current].text + '</div>')
			else
				elem.append('<div>' + instance.gameState.array[i].formulaLatex + '</div>')

			elem.addClass('game-select-element')

			elem.on('click', {index: i},(event) => {
				instance.gameState.currentGame = event.data.index
				self.gameStateRequest()
				self.toggleGameList()
			})

			$('#game-list-content').append(elem)
			$('#game-list-content').append('<hr class="white-hr"></hr>')
		}

		utils.typesetMath(() => {
			$('#game-list-content').show('fast')
		}, 'game-list-content')
	},
}
