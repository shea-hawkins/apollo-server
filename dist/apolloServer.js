'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.apolloServer = undefined;

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol ? "symbol" : typeof obj; };

exports.default = apolloServer;

var _graphqlTools = require('graphql-tools');

var _expressWidgetizer = require('express-widgetizer');

var _expressWidgetizer2 = _interopRequireDefault(_expressWidgetizer);

var _graphql = require('graphql');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// TODO this implementation could use a bit of refactoring.
// it turned from a simple function into something promise-based,
// which means the structure is now quite awkward.

function apolloServer(options) {
  if (!options) {
    throw new Error('GraphQL middleware requires options.');
  }
  if (arguments.length - 1 > 0) {
    throw new Error('apolloServer expects exactly one argument, got ' + (arguments.length - 1 + 1));
  }
  // Resolve the Options to get OptionsData.

  return function (req, res) {
    var tracerLogger = void 0;

    // TODO instrument ApolloServer's schema creation as well, so you know how long
    // it takes. May be a big waste of time to recreate the schema for every request.

    return new Promise(function (resolve) {
      resolve(typeof options === 'function' ? options(req) : options);
    }).then(function (optionsData) {
      // Assert that optionsData is in fact an Object.
      if (!optionsData || (typeof optionsData === 'undefined' ? 'undefined' : _typeof(optionsData)) !== 'object') {
        throw new Error('GraphQL middleware option function must return an options object.');
      }

      // Assert that schema is required.
      if (!optionsData.schema) {
        throw new Error('GraphQL middleware options must contain a schema.');
      }
      var schema = // pass through
      optionsData.schema;
      var // required
      resolvers = optionsData.resolvers;
      var // required if mocks is not false and schema is not GraphQLSchema
      connectors = optionsData.connectors;
      var // required if mocks is not false and schema is not GraphQLSchema
      logger = optionsData.logger;
      var tracer = optionsData.tracer;
      var printErrors = optionsData.printErrors;
      var _optionsData$mocks = optionsData.mocks;
      var mocks = _optionsData$mocks === undefined ? false : _optionsData$mocks;
      var _optionsData$allowUnd = optionsData.allowUndefinedInResolve;
      var allowUndefinedInResolve = _optionsData$allowUnd === undefined ? true : _optionsData$allowUnd;
      var pretty = optionsData.pretty;
      var _optionsData$graphiql = optionsData.graphiql;
      var // pass through
      graphiql = _optionsData$graphiql === undefined ? false : _optionsData$graphiql;
      var // pass through
      validationRules = optionsData.validationRules;
      var _optionsData$context = optionsData.context;
      var // pass through
      context = _optionsData$context === undefined ? {} : _optionsData$context;
      var // pass through, but add tracer if applicable
      rootValue = optionsData.rootValue;

      // would collide with formatError from graphql otherwise

      var formatErrorFn = optionsData.formatError;

      // TODO: currently relies on the fact that start and end both exist
      // and appear in the correct order and exactly once.
      function processInterval(supertype, subtype, tstamp, intervalMap) {
        if (subtype === 'start') {
          // eslint-disable-next-line no-param-reassign
          intervalMap[supertype] = tstamp;
        }
        if (subtype === 'end') {
          // eslint-disable-next-line no-param-reassign
          intervalMap[supertype] = tstamp - intervalMap[supertype];
        }
      }

      var executableSchema = void 0;
      if (mocks) {
        // TODO: mocks doesn't yet work with a normal GraphQL schema, but it should!
        // have to rewrite these functions
        var myMocks = mocks || {};
        if (schema instanceof _graphql.GraphQLSchema) {
          executableSchema = schema;
        } else {
          executableSchema = (0, _graphqlTools.buildSchemaFromTypeDefinitions)(schema);
        }
        (0, _graphqlTools.addResolveFunctionsToSchema)(executableSchema, resolvers || {});
        (0, _graphqlTools.addMockFunctionsToSchema)({
          schema: executableSchema,
          mocks: myMocks,
          preserveResolvers: true
        });
        if (connectors) {
          (0, _graphqlTools.attachConnectorsToContext)(executableSchema, connectors);
        }
      } else {
        // this is just basics, makeExecutableSchema should catch the rest
        // TODO: should be able to provide a GraphQLschema and still use resolvers
        // and connectors if you want, but at the moment this is not possible.
        if (schema instanceof _graphql.GraphQLSchema) {
          if (logger) {
            (0, _graphqlTools.addErrorLoggingToSchema)(schema, logger);
          }
          if (printErrors) {
            (0, _graphqlTools.addErrorLoggingToSchema)(schema, { log: function log(e) {
                return console.error(e.stack);
              } });
          }
          if (!allowUndefinedInResolve) {
            (0, _graphqlTools.addCatchUndefinedToSchema)(schema);
          }
          executableSchema = schema;
          if (resolvers) {
            (0, _graphqlTools.addResolveFunctionsToSchema)(executableSchema, resolvers);
          }
        } else {
          if (!resolvers) {
            // TODO: test this error
            throw new Error('resolvers is required option if mocks is not provided');
          }
          executableSchema = (0, _graphqlTools.makeExecutableSchema)({
            typeDefs: schema,
            resolvers: resolvers,
            connectors: connectors,
            logger: logger,
            allowUndefinedInResolve: allowUndefinedInResolve
          });
          if (printErrors) {
            (0, _graphqlTools.addErrorLoggingToSchema)(executableSchema, { log: function log(e) {
                return console.error(e.stack);
              } });
          }
        }
      }

      // Tracer-related stuff ------------------------------------------------

      tracerLogger = {
        log: undefined,
        report: function report() {},
        sumbit: function sumbit() {},
        graphqlLogger: function graphqlLogger() {}
      };
      if (tracer) {
        tracerLogger = tracer.newLoggerInstance();
        tracerLogger.log('request.info', {
          headers: req.headers,
          baseUrl: req.baseUrl,
          originalUrl: req.originalUrl,
          method: req.method,
          httpVersion: req.httpVersion,
          remoteAddr: req.connection.remoteAddress
        });
        if (context.tracer) {
          throw new Error('Property tracer on context already defined, cannot attach Tracer');
        } else {
          context.tracer = tracerLogger;
        }
      }

      // TODO: move to proper place, make less fragile ...
      // calculate timing information from events
      function timings(events) {
        var resolverDurations = [];
        var intervalMap = {};

        // split by event.type = [ , ]
        events.forEach(function (e) {
          var _e$type$split = e.type.split('.');

          var _e$type$split2 = _slicedToArray(_e$type$split, 2);

          var supertype = _e$type$split2[0];
          var subtype = _e$type$split2[1];

          switch (supertype) {
            case 'request':
            case 'parse':
            case 'validation':
            case 'execution':
            case 'parseBody':
            case 'parseParams':
              processInterval(supertype, subtype, e.timestamp, intervalMap);
              break;
            case 'resolver':
              if (subtype === 'end') {
                resolverDurations.push({
                  type: 'resolve',
                  functionName: e.data.functionName,
                  duration: e.timestamp - events[e.data.startEventId].timestamp
                });
              }
              break;
            default:
              console.error('Unknown event type ' + supertype);
          }
        });

        var durations = [];
        Object.keys(intervalMap).forEach(function (key) {
          durations.push({
            type: key,
            functionName: null,
            duration: intervalMap[key]
          });
        });
        return durations.concat(resolverDurations);
      }

      var extensionsFn = function extensionsFn() {
        try {
          return {
            timings: timings(tracerLogger.report().events),
            tracer: tracerLogger.report().events.map(function (e) {
              return {
                id: e.id,
                type: e.type,
                ts: e.timestamp,
                data: e.data
              };
            }).filter(function (x) {
              return x.type !== 'initialization';
            })
          };
        } catch (e) {
          console.error(e);
          console.error(e.stack);
        }
        return {};
      };

      // XXX ugly way of only passing extensionsFn when tracer is defined.
      if (!tracer || req.headers['x-apollo-tracer-extension'] !== 'on') {
        extensionsFn = undefined;
      }

      // end of Tracer related stuff -------------------------------------------

      // graphQLHTTPOptions
      return {
        schema: executableSchema,
        pretty: pretty,
        formatError: formatErrorFn,
        validationRules: validationRules,
        context: context,
        rootValue: rootValue,
        graphiql: graphiql,
        logFn: tracerLogger.graphqlLogger,
        extensionsFn: extensionsFn
      };
    }).then(function (graphqlHTTPOptions) {
      return (0, _expressWidgetizer2.default)(graphqlHTTPOptions)(req, res);
    }).catch(function (error) {
      // express-graphql catches its own errors, this is just for
      // errors in Apollo-server.
      // XXX we should probably care about formatErrorFn and pretty.
      res.status(error.status || 500);
      var result = { errors: [error] };
      result.errors = result.errors.map(_graphql.formatError);
      res.set('Content-Type', 'application/json').send(JSON.stringify(result));
      return result;
    }).then(function () {
      // send traces to Apollo Tracer
      tracerLogger.submit();
    });
  };
}

exports.apolloServer = apolloServer;