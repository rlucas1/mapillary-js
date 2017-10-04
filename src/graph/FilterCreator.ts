import {
    FilterExpression,
    FilterOperation,
    FilterOperator,
    FilterValue,
    Node,
} from "../Graph";
import {Func} from "../Utils";

export type FilterFunction = Func<Node, boolean>;

/**
 * @class Filter
 *
 * @classdesc Represents a class for creating node filters. Implementation and
 * definitions based on https://github.com/mapbox/feature-filter.
 */
export class FilterCreator {
    /**
     * Create a filter from a filter expression.
     *
     * @description The following filters are supported:
     *
     * Comparison
     * `==`
     * `!=`
     * `<`
     * `<=`
     * `>`
     * `>=`
     *
     * Set membership
     * `in`
     * `!in`
     *
     * Combining
     * `all`
     *
     * @param {FilterExpression} filter - Comparison, set membership or combinding filter
     * expression.
     * @returns {FilterFunction} Function taking a node and returning a boolean that
     * indicates whether the node passed the test or not.
     */
    public createFilter(filter: FilterExpression): FilterFunction {
        return <FilterFunction>new Function("node", "return " + this._compile(filter) + ";");
    }

    private _compile(filter: FilterExpression): string {
        if (filter == null || filter.length <= 1) {
            return "true";
        }

        const operator: FilterOperator = <FilterOperator>filter[0];
        const operation: string =
            operator === "==" ? this._compileComparisonOp("===", <string>filter[1], filter[2], false) :
            operator === "!=" ? this._compileComparisonOp("!==", <string>filter[1], filter[2], false) :
            operator === ">" ||
            operator === ">=" ||
            operator === "<" ||
            operator === "<=" ? this._compileComparisonOp(operator, <string>filter[1], filter[2], true) :
            operator === "in" ?
                this._compileInOp<FilterValue>(<string>filter[1], <FilterValue[]>filter.slice(2)) :
            operator === "!in" ?
                this._compileNegation(
                    this._compileInOp<FilterValue>(<string>filter[1], <FilterValue[]>filter.slice(2))) :
            operator === "all" ? this._compileLogicalOp(<FilterOperation[]>filter.slice(1), "&&") :
            "true";

        return "(" + operation + ")";
    }

    private _compare<T>(a: T, b: T): number {
        return a < b ? -1 : a > b ? 1 : 0;
    }

    private _compileComparisonOp<T>(operator: string, property: string, value: T, checkType: boolean): string {
        const tree: string[] = this._createPropertyTree(property);
        const left: string = this._compilePropertyReference(tree);
        const right: string = JSON.stringify(value);

        const op: string = (checkType ? "typeof " + left + "===typeof " + right + "&&" : "") + left + operator + right;

        return this._compileWithExists(tree, op);
    }

    private _compileInOp<T>(property: string, values: T[]): string {
        const compare: (a: T, b: T) => number = this._compare;
        const left: string = JSON.stringify(values.sort(compare));
        const tree: string[] = this._createPropertyTree(property);
        const right: string = this._compilePropertyReference(tree);

        const op: string = left + ".indexOf(" + right + ")!==-1";

        return this._compileWithExists(tree, op);
    }

    private _compileLogicalOp(filters: FilterOperation[], operator: string): string {
        const compile: (filter: FilterExpression) => string = this._compile.bind(this);

        return filters.map<string>(compile).join(operator);
    }

    private _compileNegation(expression: string): string {
        return "!(" + expression + ")";
    }

    private _compilePropertyExistsOp(tree: string[]): string {
        let last: string = "";
        let exists: string[] = [];
        for (const property of tree.slice(0, tree.length - 1)) {
            exists.push(property + "in node" + last);
            last += "[" + property + "]";
        }

        return exists.join("&&");
    }

    private _compilePropertyReference(tree: string[]): string {
        return "node[" + tree.join("][") + "]";
    }

    private _compileWithExists(tree: string[], op: string): string {
        const exists: string = this._compilePropertyExistsOp(tree);

        return (!!exists ? exists + "&&" : "") + op;
    }

    private _createPropertyTree(property: string): string[] {
        return property
            .split(".")
            .map((p: string): string => { return JSON.stringify(p); });
    }
}

export default FilterCreator;
