import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DataGridComponent, GridColumn } from './data-grid.component';

function vendorNameColumn(): GridColumn {
  return {
    field: 'vendorName',
    header: 'Company Name',
    width: '100%',
    type: 'vendor-name',
    linkBaseUrl: 'https://legacy.example',
  };
}

describe('DataGridComponent — consolidator under company name (vendor-name cell)', () => {
  let fixture: ComponentFixture<DataGridComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DataGridComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(DataGridComponent);
    fixture.componentRef.setInput('showSearch', false);
    fixture.componentRef.setInput('trackField', 'vendorKey');
    fixture.componentRef.setInput('columns', [vendorNameColumn()]);
  });

  it('renders raw consolidator (camelCase) under the company link', () => {
    fixture.componentRef.setInput('data', [
      { vendorKey: 'vk-1', vendorName: 'Acme Co', consolidator: 'Possible consolidator' },
    ]);
    fixture.detectChanges();
    const vn = fixture.nativeElement.querySelector('.vn-cell') as HTMLElement;
    expect(vn.textContent).toContain('Acme Co');
    expect(vn.textContent).toContain('Possible consolidator');
  });

  it('shows empty consolidator line when property is missing', () => {
    fixture.componentRef.setInput('data', [{ vendorKey: 'vk-3', vendorName: 'Gamma' }]);
    fixture.detectChanges();
    const raw = fixture.nativeElement.querySelector('.vn-consolidator-raw') as HTMLElement;
    expect(raw.textContent?.trim()).toBe('');
  });

  it('hides -- consolidator placeholder under the company link', () => {
    fixture.componentRef.setInput('data', [
      { vendorKey: 'vk-2', vendorName: 'Beta Co', consolidator: '--' },
    ]);
    fixture.detectChanges();
    const raw = fixture.nativeElement.querySelector('.vn-consolidator-raw') as HTMLElement;
    expect(raw.textContent?.trim()).toBe('');
  });
});

describe('DataGridComponent — consolidator under company name (vendor-company cell)', () => {
  let fixture: ComponentFixture<DataGridComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DataGridComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(DataGridComponent);
    fixture.componentRef.setInput('showSearch', false);
    fixture.componentRef.setInput('trackField', 'vendorKey');
    fixture.componentRef.setInput('columns', [
      { field: 'vendorName', header: 'Company Name', width: '100%', type: 'vendor-company' },
    ]);
  });

  it('renders consolidator label under the company name', () => {
    fixture.componentRef.setInput('data', [
      { vendorKey: 'vk-1', vendorName: 'Acme Co', consolidator: 'Full Consolidator' },
    ]);
    fixture.detectChanges();
    const cell = fixture.nativeElement.querySelector('.vc-cell') as HTMLElement;
    expect(cell.textContent).toContain('Acme Co');
    expect(cell.textContent).toContain('Full Consolidator');
  });
});

describe('DataGridComponent — vendor label stars (VendorLabel → assets)', () => {
  let fixture: ComponentFixture<DataGridComponent>;
  let comp: DataGridComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DataGridComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(DataGridComponent);
    comp = fixture.componentInstance;
    fixture.componentRef.setInput('showSearch', false);
    fixture.componentRef.setInput('trackField', 'vendorKey');
    fixture.componentRef.setInput('columns', [
      {
        field: 'jobCount',
        header: 'Qty',
        width: '100%',
        type: 'jobcount-label',
        htmlField: 'vendorLabel',
      },
    ]);
  });

  it('recognises blueStar / redstar when src has a cache-bust query string', () => {
    const html = '<img src="/Content/blueStar.png?v=1"><img src="/Content/redstarrcs.png?x=2">';
    const imgs = comp.getVendorLabelImages({ vendorKey: 'vk', vendorLabel: html }, 'vendorLabel');
    expect(imgs.length).toBe(2);
    expect(imgs[0].src).toContain('assets/images/blueStar.png');
    expect(imgs[1].src).toContain('assets/images/redstarrcs.png');
    expect(imgs[0].tooltip).toMatch(/20 miles/i);
    expect(imgs[1].tooltip).toMatch(/successfully completed/i);
  });

  it('parses Windows-style paths and unquoted src', () => {
    const html = String.raw`<img src=\Content\blueStar.png>`;
    const imgs = comp.getVendorLabelImages({ vendorKey: 'vk', vendorLabel: html }, 'vendorLabel');
    expect(imgs.length).toBe(1);
    expect(imgs[0].src).toContain('assets/images/blueStar.png');
  });

  it('decodes HTML-entity–escaped img markup before extracting src', () => {
    const html = '&lt;img src="/Content/redstarrcs.png"&gt;';
    const imgs = comp.getVendorLabelImages({ vendorKey: 'vk', vendorLabel: html }, 'vendorLabel');
    expect(imgs.length).toBe(1);
    expect(imgs[0].src).toContain('assets/images/redstarrcs.png');
  });
});
