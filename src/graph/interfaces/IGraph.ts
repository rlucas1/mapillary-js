import {Observable} from "rxjs/Observable";

import {
    FilterExpression,
    Node,
    Sequence,
} from "../../Graph";

export interface IGraph {
    readonly changed$: Observable<IGraph>;
    readonly nodes: { [key: string]: Node };

    cacheFill$(key: string): Observable<IGraph>;
    cacheFull$(key: string): Observable<IGraph>;
    cacheNodeSequence$(key: string): Observable<IGraph>;
    cacheSequence$(sequenceKey: string): Observable<IGraph>;
    cacheSequenceEdges(key: string): void;
    cacheSpatialArea$(key: string): Observable<IGraph>[];
    cacheSpatialEdges(key: string): void;
    cacheTiles$(key: string): Observable<IGraph>[];
    initializeCache(key: string): void;
    isCachingFill(key: string): boolean;
    isCachingFull(key: string): boolean;
    isCachingNodeSequence(key: string): boolean;
    isCachingSequence(sequenceKey: string): boolean;
    isCachingTiles(key: string): boolean;
    hasInitializedCache(key: string): boolean;
    hasNode(key: string): boolean;
    hasNodeSequence(key: string): boolean;
    hasSequence(sequenceKey: string): boolean;
    hasSpatialArea(key: string): boolean;
    hasTiles(key: string): boolean;
    getNode(key: string): Node;
    getSequence(sequenceKey: string): Sequence;
    resetSpatialEdges(): void;
    reset(keepKeys: string[]): void;
    setFilter(filter: FilterExpression): void;
    uncache(keepKeys: string[]): void;
}

export default IGraph;
