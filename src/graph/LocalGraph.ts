/// <reference path="../../typings/index.d.ts" />

import * as rbush from "rbush";

import {Observable} from "rxjs/Observable";
import {Subject} from "rxjs/Subject";
import {Subscriber} from "rxjs/Subscriber";

import "rxjs/add/observable/from";

import "rxjs/add/operator/catch";
import "rxjs/add/operator/do";
import "rxjs/add/operator/finally";
import "rxjs/add/operator/map";
import "rxjs/add/operator/publish";

import {
    IGPano,
    ILatLon,
    IFullNode,
} from "../API";
import {
    IEdge,
    IPotentialEdge,
    EdgeCalculator,
} from "../Edge";
import {GraphMapillaryError} from "../Error";
import {
    FilterCreator,
    FilterExpression,
    FilterFunction,
    IGraph,
    Node,
    NodeCache,
    Sequence,
    GraphCalculator,
} from "../Graph";

type NodeIndexItem = {
    lat: number;
    lon: number;
    node: Node;
};

interface IMetadata {
    altitude: number;
    ca: number;
    camera_mode: number;
    captured_at: number;
    compass_accuracy: number;
    fmm35: number;
    gpano: IGPano;
    gps_accuracy: number;
    height: number;
    key: string;
    l: ILatLon;
    make: string;
    model: string;
    orientation: number;
    skey: string;
    width: number;
    x: number;
    y: number;
    z: number;
}

interface IReconstructionData {
    atomic_scale: number;
    calt: number;
    cca: number;
    cfocal: number;
    ck1: number;
    ck2: number;
    clat: number;
    clon: number;
    key: number;
    merge_cc: number;
    merge_version: string;
    rotation: number[];
}

interface IDatabaseContractMap {
    "metadata": { [key: string]: IMetadata };
    "reconstruction": { [key: string]: IReconstructionData };
    "sequence": { [key: string]: string[] };
}

type Database = [
    { [key: string]: IMetadata },
    { [key: string]: IReconstructionData },
    { [key: string]: string[] }
];

export class LocalGraph implements IGraph {
    private _basePath: string;
    private _defaultAlt: number;
    private _loaded: boolean;
    private _loaded$: Observable<IGraph>;

    private _changed$: Subject<IGraph>;

    private _edgeCalculator: EdgeCalculator;
    private _filter: FilterFunction;
    private _filterCreator: FilterCreator;
    private _graphCalculator: GraphCalculator;
    private _nodeIndex: rbush.RBush<NodeIndexItem>;

    private _cachedNodes: { [key: string]: Node };
    private _cachedSpatialEdges: { [key: string]: Node };

    private _nodes: { [key: string]: Node };
    private _sequences: { [skey: string]: Sequence };

    constructor() {
        this._basePath = "/data/";
        this._defaultAlt = 2;
        this._loaded = false;

        this._changed$ = new Subject<IGraph>();

        this._edgeCalculator = new EdgeCalculator();
        this._filterCreator = new FilterCreator();
        this._filter = this._filterCreator.createFilter(undefined);
        this._graphCalculator = new GraphCalculator();
        this._nodeIndex = rbush<NodeIndexItem>(16, [".lat", ".lon", ".lat", ".lon"]);

        this._cachedNodes = {};
        this._cachedSpatialEdges = {};

        this._nodes = {};
        this._sequences = {};

        const data$: Observable<Database> = Observable
            .combineLatest(
                this._getDatabase$("metadata"),
                this._getDatabase$("reconstruction"),
                this._getDatabase$("sequence"))
            .publish()
            .refCount();

        data$
            .subscribe(
                ([metadata, reconstructionData, sequenceData]: Database): void => {
                    for (const key in metadata) {
                        if (!metadata.hasOwnProperty(key)) {
                            continue;
                        }

                        const m: IMetadata = metadata[key];
                        const fullNode: IFullNode = {
                            altitude: m.altitude,
                            ca: m.ca,
                            captured_at: m.captured_at,
                            gpano: m.gpano,
                            height: m.height,
                            key: m.key,
                            l: m.l,
                            project: { key: undefined },
                            sequence: { key: m.skey },
                            user: { key: undefined, username: undefined },
                            width: m.width,
                        };

                        if (key in reconstructionData) {
                            const r: IReconstructionData = reconstructionData[key];

                            fullNode.atomic_scale = r.atomic_scale;
                            fullNode.c_rotation = r.rotation;
                            fullNode.calt = r.calt;
                            fullNode.cca = r.cca;
                            fullNode.cfocal = r.cfocal;
                            fullNode.cl = { lat: r.clat, lon: r.clon };
                            fullNode.merge_cc = r.merge_cc;
                            fullNode.merge_version = Number.parseFloat(r.merge_version);
                        }

                        const node: Node = new Node(fullNode);
                        this._makeFull(node, fullNode);
                        this._nodes[node.key] = node;

                        const nodeIndexItem: NodeIndexItem = {
                            lat: node.latLon.lat,
                            lon: node.latLon.lon,
                            node: node,
                        };

                        this._nodeIndex.insert(nodeIndexItem);
                    }

                    for (const key in sequenceData) {
                        if (!sequenceData.hasOwnProperty(key)) {
                            continue;
                        }

                        const sequence: Sequence = new Sequence({ key: key, keys: sequenceData[key] });
                        this._sequences[key] = sequence;
                    }

                    this._loaded = true;
                },
                (error: Error): void => {
                    console.error("Failed to load data.", error);
                });

        this._loaded$ = data$
            .map(
                ([metadata, reconstructionData, sequenceData]: Database): IGraph => {
                    return this;
                })
            .publish()
            .refCount();
    }

    public get changed$(): Observable<IGraph> {
        return this._changed$;
    }

    public get nodes(): { [key: string]: Node } {
        return this._nodes;
    }

    public cacheFill$(key: string): Observable<IGraph> {
        return this._loaded ? Observable.of<IGraph>(this) : this._loaded$;
    }

    public cacheFull$(key: string): Observable<IGraph> {
        return this._loaded ? Observable.of<IGraph>(this) : this._loaded$;
    }

    public cacheNodeSequence$(key: string): Observable<IGraph> {
        return this._loaded ? Observable.of<IGraph>(this) : this._loaded$;
    }

    public cacheSequence$(sequenceKey: string): Observable<IGraph> {
        return this._loaded ? Observable.of<IGraph>(this) : this._loaded$;
    }

    public cacheSequenceEdges(key: string): void {
        const node: Node = this.getNode(key);
        const sequence: Sequence = this._sequences[node.sequenceKey];
        const edges: IEdge[] = this._edgeCalculator.computeSequenceEdges(node, sequence);

        const validEdges: IEdge[] = edges
            .filter(
                (edge: IEdge): boolean => {
                    return edge.to in this._nodes;
                });

        node.cacheSequenceEdges(validEdges);
    }

    public cacheSpatialArea$(key: string): Observable<IGraph>[] {
        return this._loaded ? [Observable.of<IGraph>(this)] : [this._loaded$];
    }

    public cacheSpatialEdges(key: string): void {
        if (key in this._cachedSpatialEdges) {
             throw new GraphMapillaryError(`Spatial edges already cached (${key}).`);
        }

        const node: Node = this.getNode(key);
        const filteredNodes: Node[] = [];
        const filter: FilterFunction = this._filter;
        const bbox: [ILatLon, ILatLon] = this._graphCalculator.boundingBoxCorners(node.latLon, 20);
        const areaNodes: Node[] = this._nodeIndex
            .search(
                {
                    maxX: bbox[1].lat,
                    maxY: bbox[1].lon,
                    minX: bbox[0].lat,
                    minY: bbox[0].lon,
                })
            .map((item: NodeIndexItem): Node => {
                return item.node;
            });

        for (const areaNode of areaNodes) {
            if (filter(areaNode)) {
                filteredNodes.push(areaNode);
            }
        }

        const potentialEdges: IPotentialEdge[] =
            this._edgeCalculator.getPotentialEdges(node, filteredNodes, []);

        let edges: IEdge[] =
            this._edgeCalculator.computeStepEdges(
                node,
                potentialEdges,
                null,
                null);

        edges = edges.concat(this._edgeCalculator.computeTurnEdges(node, potentialEdges));
        edges = edges.concat(this._edgeCalculator.computePanoEdges(node, potentialEdges));
        edges = edges.concat(this._edgeCalculator.computePerspectiveToPanoEdges(node, potentialEdges));
        edges = edges.concat(this._edgeCalculator.computeSimilarEdges(node, potentialEdges));

        node.cacheSpatialEdges(edges);

        this._cachedSpatialEdges[key] = node;
    }

    public cacheTiles$(key: string): Observable<IGraph>[] {
        return this._loaded ? [Observable.of<IGraph>(this)] : [this._loaded$];
    }

    public initializeCache(key: string): void {
        if (key in this._cachedNodes) {
            throw new GraphMapillaryError(`Node already in cache (${key}).`);
        }

        const node: Node = this.getNode(key);
        node.initializeCache(new NodeCache());
        this._cachedNodes[key] = node;
    }

    public isCachingFill(key: string): boolean {
        return !this._loaded;
    }

    public isCachingFull(key: string): boolean {
        return !this._loaded;
    }

    public isCachingNodeSequence(key: string): boolean {
        return !this._loaded;
    }

    public isCachingSequence(sequenceKey: string): boolean {
        return !this._loaded;
    }

    public isCachingTiles(key: string): boolean {
        return !this._loaded;
    }

    public hasInitializedCache(key: string): boolean {
        return key in this._cachedNodes;
    }

    public hasNode(key: string): boolean {
        return key in this._nodes;
    }

    public hasNodeSequence(key: string): boolean {
        const node: Node = this.getNode(key);
        const sequenceKey: string = node.sequenceKey;

        return sequenceKey in this._sequences;
    }

    public hasSequence(sequenceKey: string): boolean {
        return sequenceKey in this._sequences;
    }

    public hasSpatialArea(key: string): boolean {
        return this._loaded;
    }

    public hasTiles(key: string): boolean {
        return this._loaded;
    }

    public getNode(key: string): Node {
        return this._nodes[key];
    }

    public getSequence(sequenceKey: string): Sequence {
        return this._sequences[sequenceKey];
    }

    public resetSpatialEdges(): void {
        for (const cachedKey of Object.keys(this._cachedSpatialEdges)) {
            const node: Node = this._cachedSpatialEdges[cachedKey];
            node.resetSpatialEdges();

            delete this._cachedSpatialEdges[cachedKey];
        }
    }

    public reset(keepKeys: string[]): void { /*noop*/ }

    public setFilter(filter: FilterExpression): void {
        this._filter = this._filterCreator.createFilter(filter);
    }

    public uncache(keepKeys: string[]): void { /*noop*/ }

    private _getDatabase$<K extends keyof IDatabaseContractMap>(databaseName: K): Observable<IDatabaseContractMap[K]> {
        return Observable.create(
            (subscriber: Subscriber<IDatabaseContractMap[K]>): void => {
                const xmlHTTP: XMLHttpRequest = new XMLHttpRequest();
                xmlHTTP.open("GET", this._basePath + databaseName + "_database.json", true);
                xmlHTTP.responseType = "text";
                xmlHTTP.timeout = 15000;

                xmlHTTP.onload = (pe: ProgressEvent) => {
                    if (xmlHTTP.status !== 200) {
                        subscriber.error(`Failed to load json: ${xmlHTTP.status}, ${xmlHTTP.statusText}`);
                        return;
                    }

                    const json: IDatabaseContractMap[K] = JSON.parse(xmlHTTP.response);
                    subscriber.next(json);
                    subscriber.complete();
                };

                const onError: (e: Event) => void = (e: Event): void => {
                    subscriber.error(new Error(`Failed to fetch json for ${databaseName}.`));
                };

                xmlHTTP.onerror = onError;
                xmlHTTP.ontimeout = onError;

                xmlHTTP.send(null);
            });
    }

    private _makeFull(node: Node, fillNode: IFullNode): void {
        if (fillNode.calt == null) {
            fillNode.calt = this._defaultAlt;
        }

        if (fillNode.c_rotation == null) {
            fillNode.c_rotation = this._graphCalculator.rotationFromCompass(fillNode.ca, fillNode.orientation);
        }

        node.makeFull(fillNode);
    }
}

export default LocalGraph;
