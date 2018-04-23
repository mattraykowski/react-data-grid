const React                 = require('react');
import PropTypes from 'prop-types';
const BaseGrid              = require('./Grid');
const CheckboxEditor        = require('./editors/CheckboxEditor');
const RowUtils = require('./RowUtils');
const ColumnUtils = require('./ColumnUtils');
const KeyCodes = require('./KeyCodes');
const isFunction = require('./utils/isFunction');
import SelectAll from './formatters/SelectAll';
import AppConstants from './AppConstants';
import { DEFINE_SORT } from './cells/headerCells/SortableHeaderCell';
const ColumnMetrics = require('./ColumnMetrics');
require('../../../themes/react-data-grid-core.css');
require('../../../themes/react-data-grid-checkbox.css');

import { CellNavigationMode, EventTypes } from './constants';
import { EventBus } from './masks';

class ReactDataGrid extends React.Component {
  static displayName = 'ReactDataGrid';

  static propTypes = {
    rowHeight: PropTypes.number.isRequired,
    headerRowHeight: PropTypes.number,
    headerFiltersHeight: PropTypes.number,
    minHeight: PropTypes.number.isRequired,
    minWidth: PropTypes.number,
    enableRowSelect: PropTypes.oneOfType([PropTypes.bool, PropTypes.string]),
    onRowUpdated: PropTypes.func,
    rowGetter: PropTypes.func.isRequired,
    rowsCount: PropTypes.number.isRequired,
    toolbar: PropTypes.element,
    enableCellSelect: PropTypes.bool,
    columns: PropTypes.oneOfType([PropTypes.object, PropTypes.array]).isRequired,
    onFilter: PropTypes.func,
    onCellCopyPaste: PropTypes.func,
    onCellsDragged: PropTypes.func,
    getCellActions: PropTypes.func,
    onAddFilter: PropTypes.func,
    onGridSort: PropTypes.func,
    sortColumn: PropTypes.string,
    sortDirection: PropTypes.oneOf(Object.keys(DEFINE_SORT)),
    onDragHandleDoubleClick: PropTypes.func,
    onGridRowsUpdated: PropTypes.func,
    onRowSelect: PropTypes.func,
    rowKey: PropTypes.string,
    rowScrollTimeout: PropTypes.number,
    scrollToRowIndex: PropTypes.number,
    onClearFilters: PropTypes.func,
    contextMenu: PropTypes.element,
    cellNavigationMode: PropTypes.oneOf(['none', 'loopOverRow', 'changeRow']),
    onCellSelected: PropTypes.func,
    onCellDeSelected: PropTypes.func,
    onCellExpand: PropTypes.func,
    enableDragAndDrop: PropTypes.bool,
    onRowExpandToggle: PropTypes.func,
    draggableHeaderCell: PropTypes.func,
    getValidFilterValues: PropTypes.func,
    rowSelection: PropTypes.shape({
      enableShiftSelect: PropTypes.bool,
      onRowsSelected: PropTypes.func,
      onRowsDeselected: PropTypes.func,
      showCheckbox: PropTypes.bool,
      selectBy: PropTypes.oneOfType([
        PropTypes.shape({
          indexes: PropTypes.arrayOf(PropTypes.number).isRequired
        }),
        PropTypes.shape({
          isSelectedKey: PropTypes.string.isRequired
        }),
        PropTypes.shape({
          keys: PropTypes.shape({
            values: PropTypes.array.isRequired,
            rowKey: PropTypes.string.isRequired
          }).isRequired
        })
      ]).isRequired
    }),
    onRowClick: PropTypes.func,
    onRowDoubleClick: PropTypes.func,
    onGridKeyUp: PropTypes.func,
    onGridKeyDown: PropTypes.func,
    rowGroupRenderer: PropTypes.func,
    rowActionsCell: PropTypes.func,
    onCheckCellIsEditable: PropTypes.func,
    /* called before cell is set active, returns a boolean to determine whether cell is editable */
    overScan: PropTypes.object,
    onDeleteSubRow: PropTypes.func,
    onAddSubRow: PropTypes.func,
    enableCellAutoFocus: PropTypes.bool,
    onBeforeEdit: PropTypes.func,
    selectAllRenderer: PropTypes.object,
    minColumnWidth: PropTypes.number,
    columnEquality: PropTypes.func,
    onColumnResize: PropTypes.func
  };

  static defaultProps = {
    enableCellSelect: false,
    rowHeight: 35,
    headerFiltersHeight: 45,
    enableRowSelect: false,
    minHeight: 350,
    rowKey: 'id',
    rowScrollTimeout: 0,
    scrollToRowIndex: 0,
    cellNavigationMode: CellNavigationMode.CHANGE_ROW,
    overScan: {
      colsStart: 5,
      colsEnd: 5,
      rowsStart: 5,
      rowsEnd: 5
    },
    enableCellAutoFocus: true,
    onBeforeEdit: () => {},
    minColumnWidth: 80,
    columnEquality: ColumnMetrics.sameColumn
  };

  constructor(props, context) {
    super(props, context);
    let columnMetrics = this.createColumnMetrics();
    const initialState = {columnMetrics, selectedRows: [], copied: null, expandedRows: [], canFilter: false, columnFilters: {}, sortDirection: null, sortColumn: null, dragged: null, scrollOffset: 0, lastRowIdxUiSelected: -1};
    if (this.props.sortColumn && this.props.sortDirection) {
      initialState.sortColumn = this.props.sortColumn;
      initialState.sortDirection = this.props.sortDirection;
    }

    this.state = initialState;
    this.eventBus = new EventBus();
  }

  componentDidMount() {
    this._mounted = true;
    window.addEventListener('resize', this.metricsUpdated);
    this.metricsUpdated();
  }

  componentWillUnmount() {
    this._mounted = false;
    window.removeEventListener('resize', this.metricsUpdated);
  }

  componentWillReceiveProps(nextProps) {
    if (nextProps.columns) {
      if (!ColumnMetrics.sameColumns(this.props.columns, nextProps.columns, this.props.columnEquality) ||
          nextProps.minWidth !== this.props.minWidth) {
        let columnMetrics = this.createColumnMetrics(nextProps);
        this.setState({columnMetrics: columnMetrics});
      }
    }
  }

  selectCell = ({ idx, rowIdx }, openEditor) => {
    this.eventBus.dispatch(EventTypes.SELECT_CELL, { rowIdx, idx }, openEditor);
  };

  handleDragEnter = ({ overRowIdx }) => {
    this.eventBus.dispatch(EventTypes.DRAG_ENTER, { overRowIdx });
  };

  gridWidth = () => {
    return this.grid ? this.grid.parentElement.offsetWidth : 0;
  };

  getTotalWidth = () => {
    let totalWidth = 0;
    if (this._mounted) {
      totalWidth = this.gridWidth();
    } else {
      totalWidth = ColumnUtils.getSize(this.props.columns) * this.props.minColumnWidth;
    }
    return totalWidth;
  };

  getColumnMetricsType = (metrics) => {
    let totalWidth = metrics.totalWidth || this.getTotalWidth();
    let currentMetrics = {
      columns: metrics.columns,
      totalWidth: totalWidth,
      minColumnWidth: metrics.minColumnWidth
    };
    let updatedMetrics = ColumnMetrics.recalculate(currentMetrics);
    return updatedMetrics;
  };

  getColumn = (idx) => {
    const { columns } = this.state.columnMetrics;
    return ColumnUtils.getColumn(columns, idx);
  };

  getSize = () => {
    const { columns } = this.state.columnMetrics;
    return ColumnUtils.getSize(columns);
  };

  metricsUpdated = () => {
    const columnMetrics = this.createColumnMetrics();
    this.setState({ columnMetrics });
  };

  createColumnMetrics = (props = this.props) => {
    const gridColumns = this.setupGridColumns(props);
    return this.getColumnMetricsType({
      columns: gridColumns,
      minColumnWidth: this.props.minColumnWidth,
      totalWidth: props.minWidth
    });
  };

  onColumnResize = (index, width) => {
    const columnMetrics = ColumnMetrics.resizeColumn(this.state.columnMetrics, index, width);
    this.setState({ columnMetrics });
    if (this.props.onColumnResize) {
      this.props.onColumnResize(index, width);
    }
  };

  onKeyDown = (e) => {
    // Track which keys are currently down for shift clicking etc
    this._keysDown = this._keysDown || {};
    this._keysDown[e.keyCode] = true;

    const { onGridKeyDown } = this.props;
    if (isFunction(onGridKeyDown)) {
      onGridKeyDown(e);
    }
  };

  onKeyUp = (e) => {
    // Track which keys are currently down for shift clicking etc
    this._keysDown = this._keysDown || {};
    delete this._keysDown[e.keyCode];

    const { onGridKeyUp } = this.props;
    if (isFunction(onGridKeyUp)) {
      onGridKeyUp(e);
    }
  };

  // isKeyDown = (keyCode) => {
  //   if (!this._keysDown) return false;
  //   return keyCode in this._keysDown;
  // };

  isSingleKeyDown = (keyCode) => {
    if (!this._keysDown) return false;
    return keyCode in this._keysDown && Object.keys(this._keysDown).length === 1;
  };

  onContextMenuHide = () => {
    document.removeEventListener('click', this.onContextMenuHide);
    // let newSelected = Object.assign({}, this.state.selected, {contextMenuDisplayed: false});
    // this.setState({selected: newSelected});
  };

  onColumnEvent = (ev, columnEvent) => {
    // TODO: fix me
    const { idx, name } = columnEvent;

    if (name && typeof idx !== 'undefined') {
      const column = this.getColumn(idx);

      if (column && column.events && isFunction(column.events[name])) {
        const eventArgs = {
          idx,
          rowIdx: columnEvent.rowIdx,
          rowId: columnEvent.rowId,
          column
        };

        column.events[name](ev, eventArgs);
      }
    }
  };

  onCellClick = ({ rowIdx, idx }) => {
    const { onRowClick, rowGetter } = this.props;
    this.selectCell({ rowIdx, idx });

    if (isFunction(onRowClick)) {
      onRowClick(rowIdx, rowGetter(rowIdx), this.getColumn(idx));
    }
  };

  onCellContextMenu = ({ rowIdx, idx }) => {
    // this.onSelect({rowIdx: cell.rowIdx, idx: cell.idx, contextMenuDisplayed: this.props.contextMenu});
    this.selectCell({ rowIdx, idx });
    if (this.props.contextMenu) {
      document.addEventListener('click', this.onContextMenuHide);
    }
  };

  onCellDoubleClick = ({ rowIdx, idx }) => {
    const { onRowDoubleClick, rowGetter } = this.props;
    if (isFunction(onRowDoubleClick)) {
      onRowDoubleClick(rowIdx, rowGetter(rowIdx), this.getColumn(idx));
    }
    this.openCellEditor(rowIdx, idx);
  };

  onToggleFilter = () => {
    // setState() does not immediately mutate this.state but creates a pending state transition.
    // Therefore if you want to do something after the state change occurs, pass it in as a callback function.
    this.setState({ canFilter: !this.state.canFilter }, () => {
      if (this.state.canFilter === false && this.props.onClearFilters) {
        this.props.onClearFilters();
      }
    });
  };

  onDragHandleDoubleClick = (e) => {
    if (this.props.onDragHandleDoubleClick) {
      this.props.onDragHandleDoubleClick(e);
    }

    if (this.props.onGridRowsUpdated) {
      let cellKey = this.getColumn(e.idx).key;
      this.onGridRowsUpdated(cellKey, e.rowIdx, this.props.rowsCount - 1, {[cellKey]: e.rowData[cellKey]}, AppConstants.UpdateActions.COLUMN_FILL);
    }
  };

  onCellExpand = (args) => {
    if (this.props.onCellExpand) {
      this.props.onCellExpand(args);
    }
  };

  onRowExpandToggle = (args) => {
    if (typeof this.props.onRowExpandToggle === 'function') {
      this.props.onRowExpandToggle(args);
    }
  };

  onGridRowsUpdated = (cellKey, fromRow, toRow, updated, action, originRow) => {
    const { rowGetter, rowKey, onGridRowsUpdated } = this.props;
    if (!isFunction(onGridRowsUpdated)) {
      return;
    }

    const rowIds = [];
    for (let i = fromRow; i <= toRow; i++) {
      rowIds.push(rowGetter(i)[rowKey]);
    }

    const fromRowData = rowGetter(action === AppConstants.UpdateActions.COPY_PASTE ? originRow : fromRow);
    const fromRowId = fromRowData[rowKey];
    const toRowId = rowGetter(toRow)[rowKey];
    onGridRowsUpdated({ cellKey, fromRow, toRow, fromRowId, toRowId, rowIds, updated, action, fromRowData });
  };

  onCommit = (commit) => {
    const targetRow = commit.rowIdx;
    this.onGridRowsUpdated(commit.cellKey, targetRow, targetRow, commit.updated, AppConstants.UpdateActions.CELL_UPDATE);
  };

  handleSort = (columnKey, direction) => {
    this.setState({sortDirection: direction, sortColumn: columnKey}, () => {
      this.props.onGridSort(columnKey, direction);
    });
  };

  getSelectedRow = (rows, key) => {
    let selectedRow = rows.filter(r => {
      if (r[this.props.rowKey] === key) {
        return true;
      }
      return false;
    });
    if (selectedRow.length > 0) {
      return selectedRow[0];
    }
  };

  useNewRowSelection = () => {
    return this.props.rowSelection && this.props.rowSelection.selectBy;
  };

  // return false if not a shift select so can be handled as normal row selection
  handleShiftSelect = (rowIdx) => {
    if (this.state.lastRowIdxUiSelected > -1 && this.isSingleKeyDown(KeyCodes.Shift)) {
      let {keys, indexes, isSelectedKey} = this.props.rowSelection.selectBy;
      let isPreviouslySelected = RowUtils.isRowSelected(keys, indexes, isSelectedKey, this.props.rowGetter(rowIdx), rowIdx);

      if (isPreviouslySelected) return false;

      let handled = false;

      if (rowIdx > this.state.lastRowIdxUiSelected) {
        let rowsSelected = [];

        for (let i = this.state.lastRowIdxUiSelected + 1; i <= rowIdx; i++) {
          rowsSelected.push({rowIdx: i, row: this.props.rowGetter(i)});
        }

        if (typeof this.props.rowSelection.onRowsSelected === 'function') {
          this.props.rowSelection.onRowsSelected(rowsSelected);
        }

        handled = true;
      } else if (rowIdx < this.state.lastRowIdxUiSelected) {
        let rowsSelected = [];

        for (let i = rowIdx; i <= this.state.lastRowIdxUiSelected - 1; i++) {
          rowsSelected.push({rowIdx: i, row: this.props.rowGetter(i)});
        }

        if (typeof this.props.rowSelection.onRowsSelected === 'function') {
          this.props.rowSelection.onRowsSelected(rowsSelected);
        }

        handled = true;
      }

      if (handled) {
        this.setState({lastRowIdxUiSelected: rowIdx});
      }

      return handled;
    }

    return false;
  };

  handleNewRowSelect = (rowIdx, rowData) => {
    if (this.selectAllCheckbox && this.selectAllCheckbox.checked === true) {
      this.selectAllCheckbox.checked = false;
    }

    let {keys, indexes, isSelectedKey} = this.props.rowSelection.selectBy;
    let isPreviouslySelected = RowUtils.isRowSelected(keys, indexes, isSelectedKey, rowData, rowIdx);

    this.setState({lastRowIdxUiSelected: isPreviouslySelected ? -1 : rowIdx, selected: {rowIdx: rowIdx, idx: 0}});

    if (isPreviouslySelected && typeof this.props.rowSelection.onRowsDeselected === 'function') {
      this.props.rowSelection.onRowsDeselected([{rowIdx, row: rowData}]);
    } else if (!isPreviouslySelected && typeof this.props.rowSelection.onRowsSelected === 'function') {
      this.props.rowSelection.onRowsSelected([{rowIdx, row: rowData}]);
    }
  };

  // columnKey not used here as this function will select the whole row,
  // but needed to match the function signature in the CheckboxEditor
  handleRowSelect = (rowIdx, columnKe, rowData, e) => {
    e.stopPropagation();

    if (this.useNewRowSelection()) {
      if (this.props.rowSelection.enableShiftSelect === true) {
        if (!this.handleShiftSelect(rowIdx)) {
          this.handleNewRowSelect(rowIdx, rowData);
        }
      } else {
        this.handleNewRowSelect(rowIdx, rowData);
      }
    } else { // Fallback to old onRowSelect handler
      let selectedRows = this.props.enableRowSelect === 'single' ? [] : this.state.selectedRows.slice(0);
      let selectedRow = this.getSelectedRow(selectedRows, rowData[this.props.rowKey]);
      if (selectedRow) {
        selectedRow.isSelected = !selectedRow.isSelected;
      } else {
        rowData.isSelected = true;
        selectedRows.push(rowData);
      }
      this.setState({selectedRows: selectedRows, selected: {rowIdx: rowIdx, idx: 0}});
      if (this.props.onRowSelect) {
        this.props.onRowSelect(selectedRows.filter(r => r.isSelected === true));
      }
    }
  };

  handleCheckboxChange = (e) => {
    let allRowsSelected;
    if (e.currentTarget instanceof HTMLInputElement && e.currentTarget.checked === true) {
      allRowsSelected = true;
    } else {
      allRowsSelected = false;
    }
    if (this.useNewRowSelection()) {
      let {keys, indexes, isSelectedKey} = this.props.rowSelection.selectBy;

      if (allRowsSelected && typeof this.props.rowSelection.onRowsSelected === 'function') {
        let selectedRows = [];
        for (let i = 0; i < this.props.rowsCount; i++) {
          let rowData = this.props.rowGetter(i);
          if (!RowUtils.isRowSelected(keys, indexes, isSelectedKey, rowData, i)) {
            selectedRows.push({rowIdx: i, row: rowData});
          }
        }

        if (selectedRows.length > 0) {
          this.props.rowSelection.onRowsSelected(selectedRows);
        }
      } else if (!allRowsSelected && typeof this.props.rowSelection.onRowsDeselected === 'function') {
        let deselectedRows = [];
        for (let i = 0; i < this.props.rowsCount; i++) {
          let rowData = this.props.rowGetter(i);
          if (RowUtils.isRowSelected(keys, indexes, isSelectedKey, rowData, i)) {
            deselectedRows.push({rowIdx: i, row: rowData});
          }
        }

        if (deselectedRows.length > 0) {
          this.props.rowSelection.onRowsDeselected(deselectedRows);
        }
      }
    } else {
      let selectedRows = [];
      for (let i = 0; i < this.props.rowsCount; i++) {
        let row = Object.assign({}, this.props.rowGetter(i), {isSelected: allRowsSelected});
        selectedRows.push(row);
      }
      this.setState({selectedRows: selectedRows});
      if (typeof this.props.onRowSelect === 'function') {
        this.props.onRowSelect(selectedRows.filter(r => r.isSelected === true));
      }
    }
  };

  // getScrollOffSet = () => {
  //   let scrollOffset = 0;
  //   if (this.grid) {
  //     let canvas = this.grid.querySelector('.react-grid-Canvas');
  //     if (canvas) {
  //       scrollOffset = canvas.offsetWidth - canvas.clientWidth;
  //     }
  //   }
  //   this.setState({scrollOffset: scrollOffset});
  // };

  getRowOffsetHeight = () => {
    let offsetHeight = 0;
    this.getHeaderRows().forEach((row) => offsetHeight += parseFloat(row.height, 10) );
    return offsetHeight;
  };

  getHeaderRows = () => {
    let rows = [{ ref: (node) => this.row = node, height: this.props.headerRowHeight || this.props.rowHeight, rowType: 'header' }];
    if (this.state.canFilter === true) {
      rows.push({
        ref: (node) => this.filterRow = node,
        filterable: true,
        onFilterChange: this.props.onAddFilter,
        height: this.props.headerFiltersHeight,
        rowType: 'filter'
      });
    }
    return rows;
  };

  getInitialSelectedRows = () => {
    let selectedRows = [];
    for (let i = 0; i < this.props.rowsCount; i++) {
      selectedRows.push(false);
    }
    return selectedRows;
  };

  getRowSelectionProps = () => {
    if (this.props.rowSelection) {
      return this.props.rowSelection.selectBy;
    }

    return null;
  };

  getSelectedRows = () => {
    if (this.props.rowSelection) {
      return null;
    }

    return this.state.selectedRows.filter(r => r.isSelected === true);
  };

  getSelectedValue = () => {
    let rowIdx = this.state.selected.rowIdx;
    let idx = this.state.selected.idx;
    let cellKey = this.getColumn(idx).key;
    let row = this.props.rowGetter(rowIdx);
    return RowUtils.get(row, cellKey);
  };

  getNbrColumns = () => {
    const {columns, enableRowSelect} = this.props;
    return enableRowSelect ? columns.length + 1 : columns.length;
  };

  getDataGridDOMNode = () => {
    return this.grid;
  };

  openCellEditor = (rowIdx, idx) => {
    this.selectCell({ rowIdx, idx }, true);
  };

  scrollToColumn = (colIdx) => {
    this.eventBus.dispatch(EventTypes.SCROLL_TO_COLUMN, colIdx);
  };

  // isActive = () => {
  //   return this.state.selected.active === true;
  // };

  setupGridColumns = (props = this.props) => {
    const { columns } = props;
    if (this._cachedColumns === columns) {
      return this._cachedComputedColumns;
    }

    this._cachedColumns = columns;

    let cols = columns.slice(0);
    let unshiftedCols = {};
    if (this.props.rowActionsCell || (props.enableRowSelect && !this.props.rowSelection) || (props.rowSelection && props.rowSelection.showCheckbox !== false)) {
      const SelectAllComponent = this.props.selectAllRenderer || SelectAll;
      const SelectAllRenderer = <SelectAllComponent onChange={this.handleCheckboxChange} inputRef={grid => this.selectAllCheckbox = grid} />;
      let headerRenderer = props.enableRowSelect === 'single' ? null : SelectAllRenderer;
      let Formatter = this.props.rowActionsCell ? this.props.rowActionsCell : CheckboxEditor;
      let selectColumn = {
        key: 'select-row',
        name: '',
        formatter: <Formatter rowSelection={this.props.rowSelection}/>,
        onCellChange: this.handleRowSelect,
        filterable: false,
        headerRenderer: headerRenderer,
        width: 60,
        locked: true,
        getRowMetaData: (rowData) => rowData,
        cellClass: this.props.rowActionsCell ? 'rdg-row-actions-cell' : ''
      };
      unshiftedCols = cols.unshift(selectColumn);
      cols = unshiftedCols > 0 ? cols : unshiftedCols;
    }
    this._cachedComputedColumns = cols;

    return this._cachedComputedColumns;
  };

  renderToolbar = () => {
    let Toolbar = this.props.toolbar;
    let toolBarProps =  {columns: this.props.columns, onToggleFilter: this.onToggleFilter, numberOfRows: this.props.rowsCount};
    if (React.isValidElement(Toolbar)) {
      return ( React.cloneElement(Toolbar, toolBarProps));
    } else if (isFunction(Toolbar)) {
      return <Toolbar {...toolBarProps}/>;
    }
  };

  render() {
    let cellMetaData = {
      rowKey: this.props.rowKey,
      dragged: this.state.dragged,
      hoveredRowIdx: this.state.hoveredRowIdx,
      onCellClick: this.onCellClick,
      onCellContextMenu: this.onCellContextMenu,
      onCellDoubleClick: this.onCellDoubleClick,
      onCommit: this.onCommit,
      // onCommitCancel: this.setInactive,
      copied: this.state.copied,
      enableCellSelect: this.props.enableCellSelect,
      onColumnEvent: this.onColumnEvent,
      openCellEditor: this.openCellEditor,
      onCellExpand: this.onCellExpand,
      onRowExpandToggle: this.onRowExpandToggle,
      onRowHover: this.onRowHover,
      // getDataGridDOMNode: this.getDataGridDOMNode,
      getCellActions: this.props.getCellActions,
      onDeleteSubRow: this.props.onDeleteSubRow,
      onAddSubRow: this.props.onAddSubRow,
      // isScrollingVerticallyWithKeyboard: this.isKeyDown(KeyCodes.DownArrow) || this.isKeyDown(KeyCodes.UpArrow),
      // isScrollingHorizontallyWithKeyboard: this.isKeyDown(KeyCodes.LeftArrow) || this.isKeyDown(KeyCodes.RightArrow) || this.isKeyDown(KeyCodes.Tab),
      enableCellAutoFocus: this.props.enableCellAutoFocus,
      onDragEnter: this.handleDragEnter
    };

    let toolbar = this.renderToolbar();
    let containerWidth = this.props.minWidth || this.gridWidth();
    let gridWidth = containerWidth - this.state.scrollOffset;

    // depending on the current lifecycle stage, gridWidth() may not initialize correctly
    // this also handles cases where it always returns undefined -- such as when inside a div with display:none
    // eg Bootstrap tabs and collapses
    if (typeof containerWidth === 'undefined' || isNaN(containerWidth) || containerWidth === 0) {
      containerWidth = '100%';
    }
    if (typeof gridWidth === 'undefined' || isNaN(gridWidth) || gridWidth === 0) {
      gridWidth = '100%';
    }
    return (
      <div className="react-grid-Container" style={{width: containerWidth}}
        ref={(node) => { this.grid = node; }}>
        {toolbar}
        <div className="react-grid-Main">
          <BaseGrid
            ref={(node) => this.base = node}
            {...this.props}
            rowKey={this.props.rowKey}
            headerRows={this.getHeaderRows()}
            columnMetrics={this.state.columnMetrics}
            rowGetter={this.props.rowGetter}
            rowsCount={this.props.rowsCount}
            rowHeight={this.props.rowHeight}
            cellMetaData={cellMetaData}
            selectedRows={this.getSelectedRows()}
            rowSelection={this.getRowSelectionProps()}
            expandedRows={this.state.expandedRows}
            rowOffsetHeight={this.getRowOffsetHeight()}
            sortColumn={this.state.sortColumn}
            sortDirection={this.state.sortDirection}
            onSort={this.handleSort}
            minHeight={this.props.minHeight}
            totalWidth={gridWidth}
            onViewportKeydown={this.onKeyDown}
            onViewportKeyup={this.onKeyUp}
            onColumnResize={this.onColumnResize}
            rowScrollTimeout={this.props.rowScrollTimeout}
            scrollToRowIndex={this.props.scrollToRowIndex}
            contextMenu={this.props.contextMenu}
            overScan={this.props.overScan}
            enableCellSelect={this.props.enableCellSelect}
            enableCellAutoFocus={this.props.enableCellAutoFocus}
            cellNavigationMode={this.props.cellNavigationMode}
            eventBus={this.eventBus}
            onCheckCellIsEditable={this.props.onCheckCellIsEditable}
            onCellCopyPaste={this.props.onCellCopyPaste}
            onGridRowsUpdated={this.onGridRowsUpdated}
            onDragHandleDoubleClick={this.onDragHandleDoubleClick}
            onCellSelected={this.props.onCellSelected}
            onCellDeSelected={this.props.onCellDeSelected}
          />
        </div>
      </div>
    );
  }
}

module.exports = ReactDataGrid;
