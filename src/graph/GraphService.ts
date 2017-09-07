import {Observable} from "rxjs/Observable";
import {Subject} from "rxjs/Subject";
import {Subscription} from "rxjs/Subscription";

import "rxjs/add/operator/catch";
import "rxjs/add/operator/concat";
import "rxjs/add/operator/do";
import "rxjs/add/operator/expand";
import "rxjs/add/operator/finally";
import "rxjs/add/operator/first";
import "rxjs/add/operator/last";
import "rxjs/add/operator/map";
import "rxjs/add/operator/mergeMap";
import "rxjs/add/operator/publishReplay";

import {
    FilterExpression,
    IGraph,
    ImageLoadingService,
    Node,
    Sequence,
} from "../Graph";


/**
 * @class GraphService
 *
 * @classdesc Represents a service for graph operations.
 */
export class GraphService {
    private _graph$: Observable<IGraph>;

    private _imageLoadingService: ImageLoadingService;

    private _firstGraphSubjects$: Subject<IGraph>[];

    private _initializeCacheSubscriptions: Subscription[];
    private _sequenceSubscriptions: Subscription[];
    private _spatialSubscriptions: Subscription[];

    /**
     * Create a new graph service instance.
     *
     * @param {IGraph} graph - IGraph instance to be operated on.
     */
    constructor(graph: IGraph, imageLoadingService: ImageLoadingService) {
        this._graph$ = Observable
            .of(graph)
            .concat<IGraph, IGraph>(graph.changed$)
            .publishReplay(1)
            .refCount();

        this._graph$.subscribe(() => { /*noop*/ });

        this._imageLoadingService = imageLoadingService;

        this._firstGraphSubjects$ = [];

        this._initializeCacheSubscriptions = [];
        this._sequenceSubscriptions = [];
        this._spatialSubscriptions = [];
    }

    public get graph$(): Observable<IGraph> {
        return this._graph$;
    }

    /**
     * Cache a node in the graph and retrieve it.
     *
     * @description When called, the full properties of
     * the node are retrieved and the node cache is initialized.
     * After that the node assets are cached and the node
     * is emitted to the observable when.
     * In parallel to caching the node assets, the sequence and
     * spatial edges of the node are cached. For this, the sequence
     * of the node and the required tiles and spatial nodes are
     * retrieved. The sequence and spatial edges may be set before
     * or after the node is returned.
     *
     * @param {string} key - Key of the node to cache.
     * @return {Observable<Node>} Observable emitting a single item,
     * the node, when it has been retrieved and its assets are cached.
     * @throws {Error} Propagates any IO node caching errors to the caller.
     */
    public cacheNode$(key: string): Observable<Node> {
        let firstGraphSubject$: Subject<IGraph> = new Subject<IGraph>();

        this._firstGraphSubjects$.push(firstGraphSubject$);

        let firstGraph$: Observable<IGraph> = firstGraphSubject$
            .publishReplay(1)
            .refCount();

        let node$: Observable<Node> = firstGraph$
            .map(
                (graph: IGraph): Node => {
                    return graph.getNode(key);
                })
            .mergeMap(
                (node: Node): Observable<Node> => {
                    return node.assetsCached ?
                        Observable.of(node) :
                        node.cacheAssets$();
                })
            .publishReplay(1)
            .refCount();

        node$.subscribe(
            (node: Node): void => {
                this._imageLoadingService.loadnode$.next(node);
            },
            (error: Error): void => {
                console.error(`Failed to cache node (${key})`, error);
            });

        let initializeCacheSubscription: Subscription = this._graph$
            .first()
            .mergeMap(
                (graph: IGraph): Observable<IGraph> => {
                    if (graph.isCachingFull(key) || !graph.hasNode(key)) {
                        return graph.cacheFull$(key);
                    }

                    if (graph.isCachingFill(key) || !graph.getNode(key).full) {
                        return graph.cacheFill$(key);
                    }

                    return Observable.of<IGraph>(graph);
                })
            .do(
                (graph: IGraph): void => {
                    if (!graph.hasInitializedCache(key)) {
                        graph.initializeCache(key);
                    }
                })
            .finally(
                (): void => {
                    if (initializeCacheSubscription == null) {
                        return;
                    }

                    this._removeFromArray(initializeCacheSubscription, this._initializeCacheSubscriptions);
                    this._removeFromArray(firstGraphSubject$, this._firstGraphSubjects$);
                })
            .subscribe(
                (graph: IGraph): void => {
                    firstGraphSubject$.next(graph);
                    firstGraphSubject$.complete();
                },
                (error: Error): void => {
                    firstGraphSubject$.error(error);
                });

        if (!initializeCacheSubscription.closed) {
            this._initializeCacheSubscriptions.push(initializeCacheSubscription);
        }

        let sequenceSubscription: Subscription = firstGraph$
            .mergeMap(
                (graph: IGraph): Observable<IGraph> => {
                    if (graph.isCachingNodeSequence(key) || !graph.hasNodeSequence(key)) {
                        return graph.cacheNodeSequence$(key);
                    }

                    return Observable.of<IGraph>(graph);
                })
            .do(
                (graph: IGraph): void => {
                    if (!graph.getNode(key).sequenceEdges.cached) {
                        graph.cacheSequenceEdges(key);
                    }
                })
            .finally(
                (): void => {
                    if (sequenceSubscription == null) {
                        return;
                    }

                    this._removeFromArray(sequenceSubscription, this._sequenceSubscriptions);
                })
            .subscribe(
                (graph: IGraph): void => { return; },
                (error: Error): void => {
                    console.error(`Failed to cache sequence edges (${key}).`, error);
                });

        if (!sequenceSubscription.closed) {
            this._sequenceSubscriptions.push(sequenceSubscription);
        }

        let spatialSubscription: Subscription = firstGraph$
            .expand(
                (graph: IGraph): Observable<IGraph> => {
                    if (graph.hasTiles(key)) {
                        return Observable.empty<IGraph>();
                    }

                    return Observable
                        .from<Observable<IGraph>>(graph.cacheTiles$(key))
                        .mergeMap(
                            (graph$: Observable<IGraph>): Observable<IGraph> => {
                                return graph$
                                    .mergeMap(
                                        (g: IGraph): Observable<IGraph> => {
                                            if (g.isCachingTiles(key)) {
                                                return Observable.empty<IGraph>();
                                            }

                                            return Observable.of<IGraph>(g);
                                        })
                                    .catch(
                                        (error: Error, caught$: Observable<IGraph>): Observable<IGraph> => {
                                            console.error(`Failed to cache tile data (${key}).`, error);

                                            return Observable.empty<IGraph>();
                                        });
                            });
                })
            .last()
            .mergeMap(
                (graph: IGraph): Observable<IGraph> => {
                    if (graph.hasSpatialArea(key)) {
                        return Observable.of<IGraph>(graph);
                    }

                    return Observable
                        .from<Observable<IGraph>>(graph.cacheSpatialArea$(key))
                        .mergeMap(
                            (graph$: Observable<IGraph>): Observable<IGraph> => {
                                return graph$
                                    .catch(
                                        (error: Error, caught$: Observable<IGraph>): Observable<IGraph> => {
                                            console.error(`Failed to cache spatial nodes (${key}).`, error);

                                            return Observable.empty<IGraph>();
                                        });
                            });
                })
            .last()
            .mergeMap(
                (graph: IGraph): Observable<IGraph> => {
                    return graph.hasNodeSequence(key) ?
                        Observable.of<IGraph>(graph) :
                        graph.cacheNodeSequence$(key);
                })
            .do(
                (graph: IGraph): void => {
                    if (!graph.getNode(key).spatialEdges.cached) {
                        graph.cacheSpatialEdges(key);
                    }
                })
            .finally(
                (): void => {
                    if (spatialSubscription == null) {
                        return;
                    }

                    this._removeFromArray(spatialSubscription, this._spatialSubscriptions);
                })
            .subscribe(
                (graph: IGraph): void => { return; },
                (error: Error): void => {
                    console.error(`Failed to cache spatial edges (${key}).`, error);
                });

        if (!spatialSubscription.closed) {
            this._spatialSubscriptions.push(spatialSubscription);
        }

        return node$
            .first(
                (node: Node): boolean => {
                    return node.assetsCached;
                });
    }

    /**
     * Cache a sequence in the graph and retrieve it.
     *
     * @param {string} sequenceKey - Sequence key.
     * @returns {Observable<Sequence>} Observable emitting a single item,
     * the sequence, when it has been retrieved and its assets are cached.
     * @throws {Error} Propagates any IO node caching errors to the caller.
     */
    public cacheSequence$(sequenceKey: string): Observable<Sequence> {
        return this._graph$
            .first()
            .mergeMap(
                (graph: IGraph): Observable<IGraph> => {
                    if (graph.isCachingSequence(sequenceKey) || !graph.hasSequence(sequenceKey)) {
                        return graph.cacheSequence$(sequenceKey);
                    }

                    return Observable.of<IGraph>(graph);
                })
            .map(
                (graph: IGraph): Sequence => {
                    return graph.getSequence(sequenceKey);
                });
    }

    /**
     * Set a spatial edge filter on the graph.
     *
     * @description Resets the spatial edges of all cached nodes.
     *
     * @param {FilterExpression} filter - Filter expression to be applied.
     * @return {Observable<IGraph>} Observable emitting a single item,
     * the graph, when the spatial edges have been reset.
     */
    public setFilter$(filter: FilterExpression): Observable<IGraph> {
        this._resetSubscriptions(this._spatialSubscriptions);

        return this._graph$
            .first()
            .do(
                (graph: IGraph): void => {
                    graph.resetSpatialEdges();
                    graph.setFilter(filter);
                });
    }

    /**
     * Reset the graph.
     *
     * @description Resets the graph but keeps the nodes of the
     * supplied keys.
     *
     * @param {Array<string>} keepKeys - Keys of nodes to keep in graph.
     * @return {Observable<Node>} Observable emitting a single item,
     * the graph, when it has been reset.
     */
    public reset$(keepKeys: string[]): Observable<IGraph> {
        this._abortSubjects(this._firstGraphSubjects$);
        this._resetSubscriptions(this._initializeCacheSubscriptions);
        this._resetSubscriptions(this._sequenceSubscriptions);
        this._resetSubscriptions(this._spatialSubscriptions);

        return this._graph$
            .first()
            .do(
                (graph: IGraph): void => {
                    graph.reset(keepKeys);
                });
    }

    /**
     * Uncache the graph.
     *
     * @description Uncaches the graph by removing tiles, nodes and
     * sequences. Keeps the nodes of the supplied keys and the tiles
     * related to those nodes.
     *
     * @param {Array<string>} keepKeys - Keys of nodes to keep in graph.
     * @return {Observable<IGraph>} Observable emitting a single item,
     * the graph, when the graph has been uncached.
     */
    public uncache$(keepKeys: string[]): Observable<IGraph> {
        return this._graph$
            .first()
            .do(
                (graph: IGraph): void => {
                    graph.uncache(keepKeys);
                });
    }

    private _abortSubjects<T>(subjects: Subject<T>[]): void {
        for (let subject of subjects.slice()) {
            this._removeFromArray(subject, subjects);

            subject.error(new Error("Cache node request was aborted."));
        }
    }

    private _removeFromArray<T>(object: T, objects: T[]): void {
        let index: number = objects.indexOf(object);
        if (index !== -1) {
            objects.splice(index, 1);
        }
    }

    private _resetSubscriptions(subscriptions: Subscription[]): void {
        for (let subscription of subscriptions.slice()) {
            this._removeFromArray(subscription, subscriptions);

            if (!subscription.closed) {
                subscription.unsubscribe();
            }
        }
    }
}

export default GraphService;
