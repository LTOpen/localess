import browser from 'browser-detect';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  OnInit,
  Optional,
  signal,
  Signal,
} from '@angular/core';
import { Observable } from 'rxjs';

import { LocalStorageService } from '@core/core.module';
import { Auth, signOut } from '@angular/fire/auth';
import { Router } from '@angular/router';
import { Space } from '@shared/models/space.model';
import { environment } from '../../environments/environment';
import { USER_PERMISSIONS_IMPORT_EXPORT, UserPermission } from '@shared/models/user.model';
import { ReposService } from '@shared/generated/github/services/repos.service';
import { Release } from '@shared/generated/github/models/release';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { ReleasesDialogComponent } from '@shared/components/releases-dialog/releases-dialog.component';
import { ReleasesDialogModel } from '@shared/components/releases-dialog/releases-dialog.model';
import { SpaceStore } from '@shared/store/space.store';
import { UserStore } from '@shared/store/user.store';
import { SettingsStore } from '@shared/store/settings.store';

interface SideMenuItem {
  icon: string;
  link: string;
  label: string;
  permission?: UserPermission | UserPermission[];
  color?: 'primary';
}

@Component({
  selector: 'll-features',
  templateUrl: './features.component.html',
  styleUrl: './features.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeaturesComponent implements OnInit {
  // Settings
  isSettingsMenuExpended = signal(false);
  isDebug = environment.debug;

  logo = 'assets/logo.png';
  version = environment.version;
  releases: Release[] = [];

  userSideMenu: Signal<SideMenuItem[]> = computed(() => {
    const selectedSpaceId = this.spaceStore.selectedSpaceId();
    if (selectedSpaceId) {
      return [
        { link: `spaces/${selectedSpaceId}/dashboard`, label: 'Dashboard', icon: 'dashboard' },
        {
          link: `spaces/${selectedSpaceId}/translations`,
          label: 'Translations',
          icon: 'translate',
          permission: UserPermission.TRANSLATION_READ,
        },
        { link: `spaces/${selectedSpaceId}/contents`, label: 'Content', icon: 'web_stories', permission: UserPermission.CONTENT_READ },
        { link: `spaces/${selectedSpaceId}/assets`, label: 'Assets', icon: 'attachment', permission: UserPermission.ASSET_READ },
        { link: `spaces/${selectedSpaceId}/schemas`, label: 'Schemas', icon: 'schema', permission: UserPermission.SCHEMA_READ },
        { link: `spaces/${selectedSpaceId}/tasks`, label: 'Tasks', icon: 'task', permission: USER_PERMISSIONS_IMPORT_EXPORT },
        // { link: 'plugins', label: 'Plugins', icon: 'extension', permission: UserPermission.SPACE_MANAGEMENT },
        { link: `spaces/${selectedSpaceId}/settings`, label: 'Settings', icon: 'settings', permission: UserPermission.SPACE_MANAGEMENT },
      ];
    } else {
      return [];
    }
  });

  developerMenu: Signal<SideMenuItem[]> = computed(() => {
    const selectedSpaceId = this.spaceStore.selectedSpaceId();
    if (selectedSpaceId) {
      return [{ link: `spaces/${selectedSpaceId}/open-api`, label: 'Open API', icon: 'api' }];
    } else {
      return [];
    }
  });

  adminSideMenu: SideMenuItem[] = [
    { link: 'a/users', label: 'Users', icon: 'people', permission: UserPermission.USER_MANAGEMENT },
    { link: 'a/spaces', label: 'Spaces', icon: 'space_dashboard', permission: UserPermission.SPACE_MANAGEMENT },
  ];

  communitySideMenu: SideMenuItem[] = [
    { link: 'https://github.com/Lessify/localess/wiki', label: 'Help', icon: 'help' },
    { link: 'https://github.com/Lessify/localess', label: 'Code', icon: 'code' },
    { link: 'https://github.com/Lessify/localess/issues', label: 'Feedback', icon: 'forum' },
  ];

  stickyHeader$: Observable<boolean> | undefined;
  language$: Observable<string> | undefined;

  private destroyRef = inject(DestroyRef);
  spaceStore = inject(SpaceStore);
  userStore = inject(UserStore);
  settingsStore = inject(SettingsStore);

  constructor(
    private readonly storageService: LocalStorageService,
    private readonly cd: ChangeDetectorRef,
    private readonly router: Router,
    private readonly reposService: ReposService,
    private readonly dialog: MatDialog,
    @Optional() private auth: Auth
  ) {
    reposService
      .reposListReleases({ owner: 'Lessify', repo: 'localess' })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: value => {
          this.releases = value;
        },
      });
    effect(
      () => {
        console.log('User Authenticated Effect :', this.userStore.isAuthenticated());
        if (!this.userStore.isAuthenticated()) {
          this.router.navigate(['/login']);
        }
      },
      { allowSignalWrites: true }
    );
  }

  private static isIEorEdgeOrSafari(): boolean {
    return ['ie', 'edge', 'safari'].includes(browser().name || '');
  }

  ngOnInit(): void {
    this.storageService.testLocalStorage();
    if (FeaturesComponent.isIEorEdgeOrSafari()) {
      console.log('IE, Edge or Safari detected');
    }
  }

  onSpaceSelection(space: Space): void {
    this.spaceStore.changeSpace(space);
    this.router.navigate(['features', 'spaces', space.id, 'dashboard']);
  }

  async onLogoutClick(): Promise<void> {
    return await signOut(this.auth);
  }

  onMainMenuExpendedChangeState(): void {
    this.settingsStore.setMainMenuExpended(!this.settingsStore.mainMenuExpended());
  }

  onSettingsMenuExpendedChangeState(): void {
    this.isSettingsMenuExpended.update(it => !it);
  }

  openNewTab(link: string): void {
    window.open(link);
  }

  onDebugEnabledChangeState() {
    this.settingsStore.setDebug(!this.settingsStore.debugEnabled());
  }

  showReleases() {
    this.dialog.open<ReleasesDialogComponent, ReleasesDialogModel, void>(ReleasesDialogComponent, {
      data: {
        version: this.version,
        releases: this.releases,
      },
    });
  }
}
